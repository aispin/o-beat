'use strict';

/* ============================================================
   O My Beat · 交互真源
   调整玩法只改 CFG / SONGS，不要动逻辑分支
   ============================================================ */

const CFG = {
  layout: { judge: 0.78, spawn: -60, noteH: 20, radius: 10 },
  time: { countdownBeats: 4, defaultLookahead: 1.8 },
  bars: 16,
  windows: {
    casual: [0.055, 0.100, 0.150],
    normal: [0.040, 0.075, 0.120],
    strict: [0.025, 0.050, 0.090],
  },
  score: { perfect: 100, great: 70, good: 40 },
  combo: { step: 10, bonus: 0.02, cap: 0.20 },
  zone: 50,
  grade: [[0.95, 'S'], [0.88, 'A'], [0.78, 'B'], [0.65, 'C'], [0, 'D']],
};

const DRUM_COLOR = ['#5B8CFF', '#FF7A59', '#35D0BA', '#C084FC'];
const PAD_COLOR = '#35D0BA';
const MEL_COLOR = '#FFC94D';
const GRADE_COLOR = { perfect: '#4ADE80', great: '#FFC94D', good: '#60A5FA', miss: '#4B5563' };

const SONGS = [
  { id: 'steady', name: '匀速', tag: '正拍稳定', bpm: 75, meter: 4, root: 72, scale: 'maj', chords: ['C', 'Am', 'F', 'G'] },
  { id: 'sync',   name: '反拍', tag: '切分入门', bpm: 80, meter: 4, root: 67, scale: 'maj', chords: ['G', 'D', 'Em', 'C'] },
  { id: 'waltz',  name: '三拍', tag: '三拍重心', bpm: 72, meter: 3, root: 65, scale: 'maj', chords: ['F', 'C', 'F', 'C'] },
  { id: 'breath', name: '长呼吸', tag: '长音耐心', bpm: 65, meter: 4, root: 69, scale: 'min', chords: ['Am', 'F', 'C', 'G'] },
  { id: 'penta',  name: '五声', tag: '音感入门', bpm: 70, meter: 4, root: 74, scale: 'maj', chords: ['D', 'G', 'A', 'D'] },
  { id: 'groove', name: '切分', tag: '切分进阶', bpm: 85, meter: 4, root: 72, scale: 'maj', chords: ['C', 'F', 'G', 'Am'] },
];

const NOTE_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PENTA = { maj: [0, 2, 4, 7, 9], min: [0, 3, 5, 7, 10] };

/* ---------------- 工具 ---------------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function chordSemis(name) {
  const m = /^([A-G])(m?)$/.exec(name) || ['', 'C', ''];
  const root = NOTE_SEMI[m[1]];
  return m[2] === 'm' ? [root, root + 3, root + 7] : [root, root + 4, root + 7];
}

/* ---------------- 状态 ---------------- */
const canvas = $('#stage');
const ctx = canvas.getContext('2d');
const view = { w: 0, h: 0, dpr: 1 };

const S = {
  phase: 'home',
  mode: 'drummer',
  song: SONGS[0],
  diff: 'normal',
  notes: [],
  layout: null,
  startTime: 0,
  totalDur: 0,
  pausedAt: 0,
  score: 0,
  combo: 0,
  maxCombo: 0,
  earned: 0,
  stats: { perfect: 0, great: 0, good: 0, miss: 0, pitch: 0 },
  devs: [],
  holds: new Map(),
  fx: [],
  floats: [],
  press: {},
  lastBeat: -1,
  beatPulse: 0,
  bgHue: 200,
  bgTarget: 200,
  bgCache: null,
  bgKey: '',
};

const settings = Object.assign({
  lookahead: CFG.time.defaultLookahead,
  offset: 0,
  padOn: true,
  pitchJudge: true,
  sound: true,
}, JSON.parse(localStorage.getItem('omb.settings') || '{}'));

function saveSettings() {
  try { localStorage.setItem('omb.settings', JSON.stringify(settings)); } catch (e) {}
}

/* ============================================================
   音频引擎（原型阶段实时合成；小程序阶段换预渲染 + 采样）
   ============================================================ */
const AudioEng = {
  ctx: null,
  master: null,
  busHit: null,
  busMusic: null,
  noiseBuf: null,
  ready: false,

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    comp.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = settings.sound ? 0.9 : 0;
    this.master.connect(comp);

    this.busHit = this.ctx.createGain();
    this.busHit.gain.value = 0.95;
    this.busHit.connect(this.master);

    this.busMusic = this.ctx.createGain();
    this.busMusic.gain.value = 0.55;
    this.busMusic.connect(this.master);

    const len = Math.floor(this.ctx.sampleRate * 1.2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.ready = true;
  },

  now() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; },
  setMute(m) { if (this.master) this.master.gain.value = m ? 0 : 0.9; },

  kick(t, v, bus) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(148, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.05 * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(bus || this.busHit);
    o.start(t); o.stop(t + 0.32);
  },

  snare(t, v, bus) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const bp = c.createBiquadFilter(); bp.type = 'highpass'; bp.frequency.value = 1400;
    const g = c.createGain();
    g.gain.setValueAtTime(0.55 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(bp); bp.connect(g); g.connect(bus || this.busHit);
    s.start(t); s.stop(t + 0.18);

    const o = c.createOscillator(), og = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.06);
    og.gain.setValueAtTime(0.35 * v, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(og); og.connect(bus || this.busHit);
    o.start(t); o.stop(t + 0.12);
  },

  hat(t, v, open, bus) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = open ? 6800 : 8800;
    const g = c.createGain();
    const dur = open ? 0.26 : 0.045;
    g.gain.setValueAtTime(0.3 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(hp); hp.connect(g); g.connect(bus || this.busHit);
    s.start(t); s.stop(t + dur + 0.02);
  },

  bass(t, midi, dur, v) {
    const c = this.ctx;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.value = f;
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(560, t);
    lp.frequency.exponentialRampToValueAtTime(240, t + dur);
    lp.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(this.busMusic);
    o.start(t); o.stop(t + dur + 0.05);
  },

  pad(t, midis, dur, v) {
    const c = this.ctx;
    midis.forEach((midi, i) => {
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const o = c.createOscillator(), o2 = c.createOscillator();
      const g = c.createGain(), lp = c.createBiquadFilter();
      o.type = 'sawtooth'; o2.type = 'sawtooth';
      o.frequency.value = f; o2.frequency.value = f * 1.004;
      lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.7;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.09 * v / (i + 1), t + 0.35);
      g.gain.setValueAtTime(0.09 * v / (i + 1), t + Math.max(0.4, dur - 0.35));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.busMusic);
      o.start(t); o2.start(t);
      o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    });
  },

  tone(t, midi, dur, v) {
    const c = this.ctx;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const o = c.createOscillator(), g = c.createGain();
    const o2 = c.createOscillator(), g2 = c.createGain();
    o.type = 'triangle'; o2.type = 'sine';
    o.frequency.value = f; o2.frequency.value = f * 2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42 * v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.12 * v, t + 0.008);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.7);
    o.connect(g); g.connect(this.busHit);
    o2.connect(g2); g2.connect(this.busHit);
    o.start(t); o.stop(t + dur + 0.05);
    o2.start(t); o2.stop(t + dur + 0.05);
  },

  click(t, accent) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'square';
    o.frequency.value = accent ? 2100 : 1560;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.13 : 0.08, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g); g.connect(this.busMusic);
    o.start(t); o.stop(t + 0.05);
  },

  playHit(note) {
    if (!this.ready || !settings.sound) return;
    const t = this.now();
    if (note.track === 'drum') {
      if (note.col === 0) this.kick(t, 0.9);
      else if (note.col === 1) this.snare(t, 0.85);
      else this.hat(t, 0.55, note.col === 3);
    } else if (note.track === 'mel') {
      this.tone(t, S.song.root + PENTA[S.song.scale][note.col], 0.5, 0.9);
    } else {
      this.pad(t, [S.song.root - 12, S.song.root - 5], 0.9, 1.2);
    }
  },
};

/* ---------------- 伴奏调度 ---------------- */
const Backing = {
  events: [],
  idx: 0,
  timer: null,
  build(song) {
    const beat = 60 / song.bpm;
    const barDur = beat * song.meter;
    const ev = [];
    for (let bar = 0; bar < CFG.bars; bar++) {
      const t0 = bar * barDur;
      const chord = song.chords[bar % song.chords.length];
      const semis = chordSemis(chord);
      const rootMidi = 36 + semis[0];

      for (let b = 0; b < song.meter; b++) {
        ev.push({ at: t0 + b * beat, fn: (t) => AudioEng.hat(t, 0.16, false, AudioEng.busMusic) });
        if (b === 0 || (song.meter === 4 && b === 2)) {
          ev.push({ at: t0 + b * beat, fn: (t) => AudioEng.kick(t, 0.55, AudioEng.busMusic) });
        }
        if (b === 1 || (song.meter === 4 && b === 3)) {
          ev.push({ at: t0 + b * beat, fn: (t) => AudioEng.snare(t, 0.3, AudioEng.busMusic) });
        }
        if (b === 0) {
          ev.push({ at: t0, fn: (t) => AudioEng.bass(t, rootMidi, beat * 1.6, 0.9) });
        }
        if (song.meter === 4 && b === 2) {
          ev.push({ at: t0 + 2 * beat, fn: (t) => AudioEng.bass(t, rootMidi + 7, beat * 1.2, 0.6) });
        }
      }
      ev.push({ at: t0, fn: (t) => AudioEng.pad(t, [rootMidi + 12, rootMidi + 12 + 7, rootMidi + 24], barDur * 0.98, 1) });
    }
    ev.sort((a, b) => a.at - b.at);
    this.events = ev;
    this.idx = 0;
  },
  start() {
    this.stop();
    this.timer = setInterval(() => {
      if (!AudioEng.ctx || AudioEng.ctx.state !== 'running') return;
      const horizon = AudioEng.now() - S.startTime + 0.35;
      while (this.idx < this.events.length && this.events[this.idx].at < horizon) {
        const e = this.events[this.idx++];
        const t = S.startTime + e.at;
        if (t > AudioEng.now() - 0.05) e.fn(t);
      }
    }, 30);
  },
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
};

/* ============================================================
   谱面
   ============================================================ */
function sectionOf(bar) {
  if (bar < 4) return 0;
  if (bar < 8) return 1;
  if (bar < 12) return 2;
  return 3;
}

function buildChart() {
  const song = S.song;
  const beat = 60 / song.bpm;
  const meter = song.meter;
  const barDur = beat * meter;
  const seed = hashStr(song.id) + ({ casual: 11, normal: 23, strict: 37 }[S.diff]) * 7919;
  const rnd = mulberry32(seed);

  const notes = [];
  let id = 0;
  const push = (n) => { n.id = id++; n.status = 'pending'; n.grade = null; notes.push(n); };

  let prevCol = 2;

  for (let bar = 0; bar < CFG.bars; bar++) {
    const t0 = bar * barDur;
    const sec = sectionOf(bar);

    if (S.mode === 'drummer') {
      const K = 0, SN = 1, CH = 2, OH = 3;
      const add = (b, lane) => push({ track: 'drum', col: lane, time: t0 + b * beat, dur: 0, type: 'tap' });

      add(0, K);
      for (let b = 1; b < meter; b++) {
        if (meter === 4 && b === 2) add(b, K);
        else add(b, SN);
      }

      if (S.diff !== 'casual') {
        for (let b = 0; b < meter; b++) {
          const last = b === meter - 1;
          add(b + 0.5, last && sec >= 1 ? OH : CH);
        }
      }

      if (S.diff === 'strict') {
        if (sec >= 1) add(0.75, K);
        if (sec === 2) { add(meter - 1.25, CH); add(meter - 0.75, SN); }
        if (sec === 3) add(1.75 + Math.floor(rnd() * 2) * 0.5, CH);
      }
    } else {
      if (settings.padOn && bar % 2 === 0) {
        push({ track: 'pad', col: 0, time: t0, dur: barDur * 1.75, type: 'hold' });
      }

      const grid = S.diff === 'casual' ? 1 : 0.5;
      const density = [0.6, 0.85, 1, 0.72][sec];
      const steps = Math.round(meter / grid);

      for (let i = 0; i < steps; i++) {
        const b = i * grid;
        const isLast = i === steps - 1;
        if (!isLast && i > 0 && rnd() > density) continue;

        let col = prevCol + (Math.floor(rnd() * 5) - 2);
        col = clamp(col, 0, 4);
        if (col === prevCol && rnd() < 0.5) col = clamp(col + (rnd() < 0.5 ? 1 : -1), 0, 4);
        prevCol = col;

        push({ track: 'mel', col, time: t0 + b * beat, dur: 0, type: 'tap' });
      }
    }
  }

  notes.sort((a, b) => a.time - b.time || a.track.localeCompare(b.track));
  S.totalDur = CFG.bars * barDur;
  return notes;
}

/* ============================================================
   布局
   ============================================================ */
function computeLayout() {
  const W = view.w, H = view.h;
  const judgeY = H * CFG.layout.judge;
  const speed = (judgeY - CFG.layout.spawn) / settings.lookahead;
  const L = { W, H, judgeY, speed };

  if (S.mode === 'drummer') {
    L.laneW = W / 4;
    L.pad = null;
    L.mel = null;
  } else if (settings.padOn) {
    const u = W / 6.5;
    L.pad = { x: 0, w: u * 1.5 };
    L.mel = { x: u * 1.5, w: u * 5, colW: u };
  } else {
    L.pad = null;
    L.mel = { x: 0, w: W, colW: W / 5 };
  }
  S.layout = L;
}

function noteGeom(n) {
  const L = S.layout;
  if (n.track === 'drum') {
    return { cx: L.laneW * (n.col + 0.5), w: Math.min(L.laneW - 12, 52) };
  }
  if (n.track === 'pad') {
    return { cx: L.pad.x + L.pad.w / 2, w: Math.min(L.pad.w - 24, 62) };
  }
  return { cx: L.mel.x + L.mel.colW * (n.col + 0.5), w: Math.min(L.mel.colW - 9, 46) };
}

function noteColor(n) {
  if (n.track === 'drum') return DRUM_COLOR[n.col];
  if (n.track === 'pad') return PAD_COLOR;
  return MEL_COLOR;
}

/* ============================================================
   渲染
   ============================================================ */
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  view.w = window.innerWidth;
  view.h = window.innerHeight;
  view.dpr = dpr;
  canvas.width = Math.floor(view.w * dpr);
  canvas.height = Math.floor(view.h * dpr);
  canvas.style.width = view.w + 'px';
  canvas.style.height = view.h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  S.bgCache = null;
  computeLayout();
}

function drawBackground() {
  const L = S.layout, c = ctx;
  const key = S.bgHue.toFixed(0) + ':' + L.W + 'x' + L.H;
  if (S.bgCache && S.bgKey === key) {
    c.fillStyle = S.bgCache;
    c.fillRect(0, 0, L.W, L.H);
    return;
  }
  const g = c.createRadialGradient(L.W * 0.5, L.H * 0.22, 0, L.W * 0.5, L.H * 0.22, L.H * 0.95);
  g.addColorStop(0, 'hsla(' + S.bgHue + ',38%,13%,1)');
  g.addColorStop(0.55, 'hsla(' + (S.bgHue + 20) + ',30%,8%,1)');
  g.addColorStop(1, '#07090D');
  S.bgCache = g;
  S.bgKey = key;
  c.fillStyle = g;
  c.fillRect(0, 0, L.W, L.H);
}

function drawLanes() {
  const L = S.layout, c = ctx, H = L.H;

  c.save();
  if (L.mel) {
    if (L.pad) {
      const pg = c.createLinearGradient(0, 0, L.pad.w, 0);
      pg.addColorStop(0, 'rgba(53,208,186,0.11)');
      pg.addColorStop(1, 'rgba(53,208,186,0.02)');
      c.fillStyle = pg;
      c.fillRect(0, 0, L.pad.w, H);
      c.strokeStyle = 'rgba(53,208,186,0.26)';
      c.beginPath(); c.moveTo(L.pad.w, 0); c.lineTo(L.pad.w, H); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.025)';
      for (let i = 1; i < 5; i++) {
        const x = L.mel.x + L.mel.colW * i;
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
      }
    } else {
      c.strokeStyle = 'rgba(255,255,255,0.03)';
      for (let i = 1; i < 5; i++) {
        const x = L.mel.colW * i;
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
      }
    }

    const showHeader = S.diff !== 'strict';
    for (let i = 0; i < 5; i++) {
      const x = L.mel.x + L.mel.colW * (i + 0.5);
      c.fillStyle = showHeader ? 'rgba(255,201,77,0.62)' : 'rgba(255,201,77,0.2)';
      c.font = '600 11px -apple-system, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(NOTE_NAMES[(S.song.root + PENTA[S.song.scale][i]) % 12], x, L.judgeY + 34);
    }

    if (L.pad) {
      c.save();
      c.globalAlpha = 0.34;
      c.fillStyle = '#35D0BA';
      c.font = '600 10px -apple-system, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('PAD', L.pad.x + L.pad.w / 2, L.judgeY + 34);
      c.restore();
    }
  } else {
    c.strokeStyle = 'rgba(255,255,255,0.045)';
    for (let i = 1; i < 4; i++) {
      c.beginPath();
      c.moveTo(L.laneW * i, 0);
      c.lineTo(L.laneW * i, H);
      c.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const x = L.laneW * (i + 0.5);
      const p = S.press[i] || 0;
      c.save();
      c.globalAlpha = 0.3 + p * 0.7;
      c.fillStyle = DRUM_COLOR[i];
      c.font = '600 10px -apple-system, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(['KICK', 'SNARE', 'CH', 'OH'][i], x, L.judgeY + 34);
      c.restore();
    }
  }
  c.restore();
}

function drawHitZone() {
  const L = S.layout, c = ctx;
  const zoneH = L.H - L.judgeY;

  c.fillStyle = 'rgba(255,255,255,0.014)';
  c.fillRect(0, L.judgeY, L.W, zoneH);

  const grad = c.createLinearGradient(0, L.judgeY, 0, L.H);
  grad.addColorStop(0, 'rgba(53,208,186,0.16)');
  grad.addColorStop(0.55, 'rgba(53,208,186,0.03)');
  grad.addColorStop(1, 'rgba(53,208,186,0)');
  c.fillStyle = grad;
  c.fillRect(0, L.judgeY, L.W, zoneH);

  Object.keys(S.press).forEach((k) => {
    const p = S.press[k];
    if (!p || p < 0.01) return;
    const x = L.laneW * (Number(k) + 0.5);
    const g = c.createRadialGradient(x, L.judgeY, 0, x, L.judgeY, L.laneW * 0.9);
    g.addColorStop(0, 'rgba(255,255,255,' + (0.18 * p) + ')');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(x - L.laneW, L.judgeY - 90, L.laneW * 2, 180);
  });
}

function drawJudgeLine() {
  const L = S.layout, c = ctx;
  const pulse = S.beatPulse;

  const glow = c.createLinearGradient(0, L.judgeY - 64, 0, L.judgeY + 2);
  glow.addColorStop(0, 'rgba(53,208,186,0)');
  glow.addColorStop(1, 'rgba(53,208,186,' + (0.16 + pulse * 0.2) + ')');
  c.fillStyle = glow;
  c.fillRect(0, L.judgeY - 64, L.W, 66);

  c.strokeStyle = 'rgba(255,255,255,' + (0.5 + pulse * 0.4) + ')';
  c.lineWidth = 2 + pulse * 1.6;
  c.beginPath();
  c.moveTo(0, L.judgeY);
  c.lineTo(L.W, L.judgeY);
  c.stroke();

  c.strokeStyle = 'rgba(53,208,186,' + (0.5 + pulse * 0.4) + ')';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(0, L.judgeY + 2.5);
  c.lineTo(L.W, L.judgeY + 2.5);
  c.stroke();

  const step = L.laneW || (L.mel ? L.mel.colW : 0);
  if (step) {
    c.strokeStyle = 'rgba(255,255,255,0.22)';
    c.lineWidth = 1;
    for (let x = step; x < L.W - 1; x += step) {
      c.beginPath();
      c.moveTo(x, L.judgeY - 7);
      c.lineTo(x, L.judgeY + 7);
      c.stroke();
    }
  }
}

function drawNote(n, t) {
  const L = S.layout, c = ctx;
  const g = noteGeom(n);
  const y = L.judgeY - (n.time - t) * L.speed;
  const color = noteColor(n);

  if (n.type === 'hold') {
    const headY = y;
    const tailY = y - n.dur * L.speed;
    const top = Math.min(tailY, L.judgeY - 4);
    const bottom = Math.min(headY, L.judgeY);
    if (bottom > -80 && top < L.H + 60) {
      const dim = n.status === 'miss';
      if (dim) c.globalAlpha = 0.26;
      const h = Math.max(4, bottom - top);
      c.fillStyle = 'rgba(53,208,186,0.16)';
      c.strokeStyle = 'rgba(53,208,186,0.55)';
      c.lineWidth = 1;
      roundRect(c, g.cx - g.w / 2, top, g.w, h, Math.min(14, g.w / 2));
      c.fill(); c.stroke();
      const hy = Math.min(headY, L.judgeY);
      if (hy > -40) {
        c.fillStyle = color;
        roundRect(c, g.cx - g.w / 2, hy - 9, g.w, 18, 9);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.32)';
        roundRect(c, g.cx - g.w / 2 + 3, hy - 7, g.w - 6, 5, 3);
        c.fill();
      }
      if (dim) c.globalAlpha = 1;
    }
    return;
  }

  if (y < -40 || y > L.H + 40) return;

  if (n.status === 'miss') {
    c.globalAlpha = 0.25;
    c.fillStyle = '#3A4150';
    roundRect(c, g.cx - g.w / 2, y - CFG.layout.noteH / 2, g.w, CFG.layout.noteH, CFG.layout.radius);
    c.fill();
    c.globalAlpha = 1;
    return;
  }

  c.fillStyle = color;
  roundRect(c, g.cx - g.w / 2, y - CFG.layout.noteH / 2, g.w, CFG.layout.noteH, CFG.layout.radius);
  c.fill();

  c.fillStyle = 'rgba(255,255,255,0.28)';
  roundRect(c, g.cx - g.w / 2 + 3, y - CFG.layout.noteH / 2 + 3, g.w - 6, 5, 3);
  c.fill();

  if (S.mode === 'melodist' && S.diff === 'casual') {
    c.fillStyle = 'rgba(12,16,22,0.75)';
    c.font = '700 10px -apple-system, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(NOTE_NAMES[(S.song.root + PENTA[S.song.scale][n.col]) % 12], g.cx, y + 0.5);
  }
}

function drawNotes(t) {
  const horizon = settings.lookahead + 0.4;
  for (let i = 0; i < S.notes.length; i++) {
    const n = S.notes[i];
    const dt = n.time - t;
    if (dt > horizon) break;
    if (n.status === 'done') continue;
    if (n.type === 'hold' ? dt + n.dur < -0.35 : dt < -0.35) continue;
    drawNote(n, t);
  }
}

function drawFx(now) {
  const c = ctx;
  for (let i = S.fx.length - 1; i >= 0; i--) {
    const f = S.fx[i];
    const p = (now - f.t0) / f.life;
    if (p >= 1) { S.fx.splice(i, 1); continue; }
    if (f.kind === 'ring') {
      c.globalAlpha = (1 - p) * 0.75;
      c.strokeStyle = f.color;
      c.lineWidth = 2.5 * (1 - p) + 0.5;
      c.beginPath();
      c.arc(f.x, f.y, 8 + p * 34, 0, Math.PI * 2);
      c.stroke();
    } else {
      c.globalAlpha = 1 - p;
      c.fillStyle = f.color;
      const r = 2.6 * (1 - p * 0.5);
      c.beginPath();
      c.arc(f.x + f.vx * p, f.y + f.vy * p + 40 * p * p, r, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }
}

function drawFloats(now) {
  const c = ctx;
  for (let i = S.floats.length - 1; i >= 0; i--) {
    const f = S.floats[i];
    const p = (now - f.t0) / f.life;
    if (p >= 1) { S.floats.splice(i, 1); continue; }
    c.globalAlpha = Math.max(0, 1 - p * p);
    c.fillStyle = f.color;
    c.font = '700 ' + f.size + 'px -apple-system, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(f.text, f.x, f.y - 34 * p);
    c.globalAlpha = 1;
  }
}

function draw() {
  const L = S.layout;
  if (!L) return;
  const t = elapsed();

  S.bgHue += (S.bgTarget - S.bgHue) * 0.02;
  drawBackground();
  drawLanes();
  drawHitZone();
  drawNotes(t);
  drawJudgeLine();

  const now = AudioEng.now();
  drawFx(now);
  drawFloats(now);
}

/* ============================================================
   时间与判定
   ============================================================ */
function elapsed() {
  if (S.phase === 'home') return 0;
  return AudioEng.now() - S.startTime - settings.offset / 1000;
}

function win() {
  const w = CFG.windows[S.diff];
  return { perfect: w[0], great: w[1], good: w[2] };
}

function gradeOf(dt) {
  const w = win();
  const a = Math.abs(dt);
  if (a <= w.perfect) return 'perfect';
  if (a <= w.great) return 'great';
  if (a <= w.good) return 'good';
  return null;
}

function comboMult() {
  return 1 + Math.min(CFG.combo.cap, Math.floor(S.combo / CFG.combo.step) * CFG.combo.bonus);
}

function addScore(base, x, y, grade) {
  const gain = Math.round(base * comboMult());
  S.score += gain;
  S.earned += base;
  const el = $('#hudScore');
  el.textContent = S.score;
  el.classList.add('pop');
  setTimeout(() => el.classList.remove('pop'), 90);

  if (grade !== 'miss') {
    S.combo++;
    if (S.combo > S.maxCombo) S.maxCombo = S.combo;
    if (S.combo >= CFG.zone) document.body.classList.add('zone');
  }
  updateComboUI();

  if (grade && grade !== 'miss') {
    S.fx.push({ kind: 'ring', x, y, t0: AudioEng.now(), life: 0.42, color: GRADE_COLOR[grade] });
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (1 + Math.random()) * 0.5;
      S.fx.push({
        kind: 'dot', x, y, t0: AudioEng.now(), life: 0.36,
        color: GRADE_COLOR[grade],
        vx: Math.cos(a) * 26 * (Math.random() * 0.6 + 0.4),
        vy: -Math.sin(a) * 26 * (Math.random() * 0.6 + 0.4),
      });
    }
    const label = { perfect: 'PERFECT', great: 'GREAT', good: 'GOOD' }[grade];
    S.floats.push({
      x: S.layout.W / 2, y: S.layout.judgeY - 46,
      text: label, color: GRADE_COLOR[grade], t0: AudioEng.now(), life: 0.5, size: 15,
    });
    document.getElementById('judgeFlash').classList.add('on');
    setTimeout(() => document.getElementById('judgeFlash').classList.remove('on'), 60);
  }
}

function updateComboUI() {
  const box = $('#combo');
  const num = $('#comboNum');
  if (S.combo < 2) { box.classList.remove('show'); return; }
  box.classList.add('show');
  num.textContent = S.combo;
  num.style.transform = 'scale(1.12)';
  setTimeout(() => { num.style.transform = 'scale(1)'; }, 80);
}

function handleHit(x, pid) {
  const L = S.layout;
  const t = elapsed();
  if (S.mode === 'drummer') {
    if (x < 0 || x > L.W) return;
    const lane = clamp(Math.floor(x / L.laneW), 0, 3);
    judgeDrum(lane, t);
  } else {
    if (L.pad && x < L.pad.w) { startHold(t, pid); return; }
    const col = clamp(Math.floor((x - L.mel.x) / L.mel.colW), 0, 4);
    judgeMel(col, t);
  }
}

function judgeDrum(lane, t) {
  const w = win();
  let best = null, bd = 1e9;
  for (let i = 0; i < S.notes.length; i++) {
    const n = S.notes[i];
    if (n.track !== 'drum' || n.col !== lane || n.status !== 'pending') continue;
    const d = Math.abs(n.time - t);
    if (d < bd) { bd = d; best = n; }
    if (n.time - t > w.good) break;
  }
  const g = noteGeom({ track: 'drum', col: lane });
  AudioEng.playHit({ track: 'drum', col: lane });

  if (best && bd <= w.good) {
    const grade = gradeOf(t - best.time) || 'good';
    best.status = 'done';
    best.grade = grade;
    S.stats[grade]++;
    S.devs.push(Math.round((t - best.time) * 1000));
    addScore(CFG.score[grade], g.cx, S.layout.judgeY, grade);
  } else {
    S.press[lane] = 1;
  }
}

function nearestMel(t, col, useCol) {
  const w = win();
  let best = null, bd = 1e9, anyBest = null, anyBd = 1e9;
  for (let i = 0; i < S.notes.length; i++) {
    const n = S.notes[i];
    if (n.track !== 'mel' || n.status !== 'pending') continue;
    const d = Math.abs(n.time - t);
    if (d < anyBd) { anyBd = d; anyBest = n; }
    if (useCol && n.col !== col) continue;
    if (d < bd) { bd = d; best = n; }
    if (n.time - t > w.good) break;
  }
  return { best, bd, anyBest, anyBd };
}

function judgeMel(col, t) {
  const w = win();
  const pitchOn = settings.pitchJudge;
  const r = nearestMel(t, col, pitchOn);
  const geom = { cx: S.layout.mel.x + S.layout.mel.colW * (col + 0.5), w: 40 };

  if (pitchOn) {
    if (r.best && r.bd <= w.good) {
      const grade = gradeOf(t - r.best.time) || 'good';
      r.best.status = 'done';
      S.stats[grade]++;
      S.devs.push(Math.round((t - r.best.time) * 1000));
      AudioEng.playHit(r.best);
      addScore(CFG.score[grade], geom.cx, S.layout.judgeY, grade);
      return;
    }
    if (r.anyBest && r.anyBd <= w.good) {
      // 音高错：节奏对，但音错了。最高 GOOD，并播放点错的那个音
      r.anyBest.status = 'done';
      S.stats.good++;
      S.stats.pitch++;
      S.devs.push(Math.round((t - r.anyBest.time) * 1000));
      AudioEng.tone(AudioEng.now(), S.song.root + PENTA[S.song.scale][col], 0.4, 1);
      addScore(CFG.score.good, geom.cx, S.layout.judgeY, 'good');
      S.floats.push({
        x: S.layout.W / 2, y: S.layout.judgeY - 70,
        text: '音准', color: '#8C94A6', t0: AudioEng.now(), life: 0.45, size: 11,
      });
      return;
    }
  } else {
    if (r.anyBest && r.anyBd <= w.good) {
      const grade = gradeOf(t - r.anyBest.time) || 'good';
      r.anyBest.status = 'done';
      S.stats[grade]++;
      S.devs.push(Math.round((t - r.anyBest.time) * 1000));
      AudioEng.playHit({ track: 'mel', col });
      addScore(CFG.score[grade], geom.cx, S.layout.judgeY, grade);
      return;
    }
  }

  // 空击
  AudioEng.playHit({ track: 'mel', col });
}

function startHold(t, pid) {
  const w = win();
  let best = null, bd = 1e9;
  for (let i = 0; i < S.notes.length; i++) {
    const n = S.notes[i];
    if (n.track !== 'pad' || n.status !== 'pending') continue;
    const d = Math.abs(n.time - t);
    if (d < bd) { bd = d; best = n; }
    if (n.time - t > w.good) break;
  }
  if (best && bd <= Math.max(w.good, 0.28)) {
    best.status = 'holding';
    best.grade = gradeOf(t - best.time) || 'good';
    best.heldFrom = t;
    best.pid = pid;
    S.holds.set('pad', best);
    AudioEng.playHit(best);
  }
}

function endHold(t) {
  const n = S.holds.get('pad');
  if (!n) return;
  S.holds.delete('pad');
  const held = clamp((t - n.time) / n.dur, 0, 1);
  n.status = 'done';
  n.heldRatio = held;

  if (held < 0.08) {
    n.status = 'miss';
    S.stats.miss++;
    S.combo = 0;
    updateComboUI();
    return;
  }
  S.stats[n.grade]++;
  S.devs.push(0);
  const base = CFG.score[n.grade] * (held >= 0.9 ? 1 : held);
  addScore(base, S.layout.pad.x + S.layout.pad.w / 2, S.layout.judgeY, n.grade);
}

/* ============================================================
   主循环
   ============================================================ */
function update(t) {
  const w = win();
  const now = AudioEng.now();

  for (let i = 0; i < S.notes.length; i++) {
    const n = S.notes[i];
    if (n.status !== 'pending') continue;
    const limit = n.type === 'hold' ? Math.max(w.good, 0.28) : w.good;
    if (t > n.time + limit) {
      n.status = 'miss';
      n.grade = 'miss';
      S.stats.miss++;
      if (S.combo > 2) {
        S.floats.push({
          x: S.layout.W / 2, y: S.layout.judgeY - 46,
          text: 'MISS', color: '#4B5563', t0: now, life: 0.5, size: 13,
        });
      }
      S.combo = 0;
      updateComboUI();
    }
    if (n.time - t > 1.2) break;
  }

  const hold = S.holds.get('pad');
  if (hold && t >= hold.time + hold.dur) endHold(t);

  // 拍脉冲
  const beat = 60 / S.song.bpm;
  const idx = Math.floor(t / beat);
  if (idx !== S.lastBeat && t >= 0) {
    S.lastBeat = idx;
    S.beatPulse = 1;
    const chords = S.song.chords;
    const bar = Math.floor(t / (beat * S.song.meter));
    const ci = bar % chords.length;
    const hues = [200, 268, 36, 320];
    S.bgTarget = hues[ci % hues.length];
  }
  S.beatPulse *= 0.9;
  for (const k in S.press) S.press[k] *= 0.88;

  if (S.phase === 'playing' && t > S.totalDur + 0.4) endRun();
}

function loop() {
  requestAnimationFrame(loop);
  if (S.phase === 'home') return;

  if (S.phase === 'playing') {
    const t = elapsed();
    update(t);
    draw();
    updateCountdown(t);
  } else if (S.phase === 'paused') {
    draw();
  }
}

function updateCountdown(t) {
  const cd = $('#countdown');
  if (t < 0 && S.phase === 'playing') {
    const beat = 60 / S.song.bpm;
    const n = Math.ceil(-t / beat);
    if (n > 0 && n <= CFG.time.countdownBeats) {
      if (!cd.classList.contains('show')) cd.classList.add('show');
      const el = $('#countNum');
      if (el.textContent !== String(n)) {
        el.textContent = String(n);
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = '';
      }
    }
  } else {
    cd.classList.remove('show');
  }
}

/* ============================================================
   开局 / 结束
   ============================================================ */
function startRun() {
  AudioEng.init();
  AudioEng.setMute(!settings.sound);
  computeLayout();

  S.notes = buildChart();
  S.score = 0;
  S.combo = 0;
  S.maxCombo = 0;
  S.earned = 0;
  S.stats = { perfect: 0, great: 0, good: 0, miss: 0, pitch: 0 };
  S.devs = [];
  S.holds.clear();
  S.fx = [];
  S.floats = [];
  S.press = {};
  S.lastBeat = -1;
  S.beatPulse = 0;
  S.phase = 'playing';

  const beat = 60 / S.song.bpm;
  const lead = CFG.time.countdownBeats * beat + 0.35;
  S.startTime = AudioEng.now() + lead;

  for (let i = 0; i < CFG.time.countdownBeats; i++) {
    AudioEng.click(S.startTime - (CFG.time.countdownBeats - i) * beat, i === 0);
  }

  Backing.build(S.song);
  Backing.start();

  $('#hudScore').textContent = '0';
  $('#combo').classList.remove('show');
  document.body.classList.add('ingame');
  document.body.classList.remove('zone');
  showScreen(null);
}

function endRun() {
  if (S.phase === 'result') return;
  S.phase = 'result';
  Backing.stop();
  document.body.classList.remove('ingame');
  document.body.classList.remove('zone');

  const total = S.notes.length || 1;
  const acc = clamp(S.earned / (total * 100), 0, 1);
  const devAbs = S.devs.length
    ? Math.sqrt(S.devs.reduce((s, d) => s + d * d, 0) / S.devs.length)
    : 0;
  const stability = clamp(100 - devAbs / 1.5, 0, 100);
  const full = clamp(1 - S.stats.miss / total, 0, 1);

  let g = 'D';
  for (const [th, letter] of CFG.grade) { if (acc >= th) { g = letter; break; } }

  $('#gradeLetter').textContent = g;
  $('#gradeSub').textContent = acc >= 0.95 ? '完美演奏' : acc >= 0.88 ? '非常稳' : acc >= 0.78 ? '渐入佳境' : acc >= 0.65 ? '继续' : '慢慢来';
  $('#rScore').textContent = S.score;
  $('#rCombo').textContent = S.maxCombo;

  renderMetrics(acc, stability, full);
  renderHisto();

  const mean = S.devs.length ? S.devs.reduce((s, d) => s + d, 0) / S.devs.length : 0;
  let diag = '节奏很稳。继续把注意力放在拍子上。';
  if (mean < -40) diag = '你整体偏早 ' + Math.abs(Math.round(mean)) + 'ms，可以再等一下拍子。';
  else if (mean > 40) diag = '你整体偏慢 ' + Math.round(mean) + 'ms，试着提前一点。';
  if (S.stats.pitch > 0) diag += ' 有 ' + S.stats.pitch + ' 次音高偏移，听一听再落指。';
  $('#diag').textContent = diag;

  showScreen('screenResult');
}

function renderMetrics(acc, stability, full) {
  const rows = [
    ['准确率', acc * 100, acc * 100],
    ['稳定度', stability, stability],
    ['完整度', full * 100, full * 100],
  ];
  $('#metrics').innerHTML = rows.map((r) => (
    '<div class="metric"><span class="k">' + r[0] + '</span>' +
    '<span class="bar"><i style="width:' + r[1].toFixed(1) + '%"></i></span>' +
    '<span class="v">' + Math.round(r[2]) + '</span></div>'
  )).join('');
}

function renderHisto() {
  const buckets = 21;
  const counts = new Array(buckets).fill(0);
  S.devs.forEach((d) => {
    const i = clamp(Math.floor((d + 105) / 10), 0, buckets - 1);
    counts[i]++;
  });
  const max = Math.max(1, ...counts);
  $('#histo').innerHTML = counts.map((c, i) => {
    const h = c === 0 ? 0 : Math.max(8, (c / max) * 100);
    const cls = i === 10 ? 'zero' : i < 10 ? 'early' : 'late';
    return '<i class="' + cls + '" style="height:' + h.toFixed(0) + '%"></i>';
  }).join('');
}

/* ============================================================
   UI
   ============================================================ */
function showScreen(id) {
  ['screenHome', 'screenResult'].forEach((k) => {
    $('#' + k).classList.toggle('hide', k !== id);
  });
}

function renderSongs() {
  $('#songList').innerHTML = SONGS.map((s) => (
    '<button class="song' + (s.id === S.song.id ? ' on' : '') + '" data-id="' + s.id + '">' +
    '<span class="dot"></span><b>' + s.name + '</b><span>' + s.tag + '</span>' +
    '<em>' + s.bpm + ' BPM · ' + s.meter + '/4</em></button>'
  )).join('');
  $$('#songList .song').forEach((el) => {
    el.addEventListener('click', () => {
      S.song = SONGS.find((x) => x.id === el.dataset.id);
      $$('#songList .song').forEach((x) => x.classList.remove('on'));
      el.classList.add('on');
      $('#songHint').textContent = Math.round(CFG.bars * S.song.meter * 60 / S.song.bpm) + ' 秒';
    });
  });
}

function bindUI() {
  $$('#modeRow .mode-card').forEach((el) => {
    el.addEventListener('click', () => {
      S.mode = el.dataset.mode;
      $$('#modeRow .mode-card').forEach((x) => x.classList.remove('on'));
      el.classList.add('on');
      computeLayout();
    });
  });

  $$('#diffSeg button').forEach((el) => {
    el.addEventListener('click', () => {
      S.diff = el.dataset.d;
      $$('#diffSeg button').forEach((x) => x.classList.remove('on'));
      el.classList.add('on');
      const note = {
        casual: '音符稀疏，判定宽松，适合找感觉',
        normal: '正反拍都有，判定标准',
        strict: '加花与切分，判定严格',
      }[S.diff];
      $('#diffNote').textContent = note;
    });
  });

  $('#startBtn').addEventListener('click', startRun);

  $('#settingsBtn').addEventListener('click', () => {
    $('#sheet').classList.remove('hide');
    $('#backdrop').classList.add('show');
  });
  const closeSheet = () => {
    $('#sheet').classList.add('hide');
    $('#backdrop').classList.remove('show');
  };
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#backdrop').addEventListener('click', closeSheet);

  $('#speedRange').value = settings.lookahead;
  $('#speedVal').textContent = Number(settings.lookahead).toFixed(1) + 's';
  $('#speedRange').addEventListener('input', (e) => {
    settings.lookahead = Number(e.target.value);
    $('#speedVal').textContent = settings.lookahead.toFixed(1) + 's';
    computeLayout();
    saveSettings();
  });

  $('#offsetRange').value = settings.offset;
  $('#offsetVal').textContent = settings.offset + 'ms';
  $('#offsetRange').addEventListener('input', (e) => {
    settings.offset = Number(e.target.value);
    $('#offsetVal').textContent = settings.offset + 'ms';
    saveSettings();
  });

  [['padSwitch', 'padOn'], ['pitchSwitch', 'pitchJudge'], ['soundSwitch', 'sound']].forEach(([id, key]) => {
    const el = $('#' + id);
    el.classList.toggle('on', !!settings[key]);
    el.addEventListener('click', () => {
      settings[key] = !settings[key];
      el.classList.toggle('on', settings[key]);
      saveSettings();
      if (key === 'sound') AudioEng.setMute(!settings.sound);
      if (key === 'padOn' && S.phase !== 'playing' && S.phase !== 'paused') computeLayout();
    });
  });

  $('#pauseBtn').addEventListener('click', () => {
    if (S.phase !== 'playing') return;
    S.phase = 'paused';
    if (AudioEng.ctx) { S.pausedAt = AudioEng.ctx.currentTime; AudioEng.ctx.suspend(); }
    $('#pauseModal').classList.remove('hide');
  });

  $('#resumeBtn').addEventListener('click', () => {
    $('#pauseModal').classList.add('hide');
    if (AudioEng.ctx) {
      AudioEng.ctx.resume().then(() => {
        S.startTime += AudioEng.ctx.currentTime - S.pausedAt;
        S.phase = 'playing';
      });
    } else {
      S.phase = 'playing';
    }
  });

  $('#quitBtn').addEventListener('click', () => {
    $('#pauseModal').classList.add('hide');
    if (AudioEng.ctx) AudioEng.ctx.resume();
    S.phase = 'playing';
    endRun();
  });

  $('#againBtn').addEventListener('click', () => { showScreen(null); startRun(); });
  $('#homeBtn').addEventListener('click', () => {
    S.phase = 'home';
    document.body.classList.remove('ingame');
    showScreen('screenHome');
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (S.phase !== 'playing') return;
    e.preventDefault();
    handleHit(e.clientX, e.pointerId);
  });

  const releaseHold = (e) => {
    if (S.phase !== 'playing') return;
    const n = S.holds.get('pad');
    if (n && n.pid === e.pointerId) endHold(elapsed());
  };
  window.addEventListener('pointerup', releaseHold);
  window.addEventListener('pointercancel', releaseHold);

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
}

/* ---------------- 启动 ---------------- */
resize();
bindUI();
renderSongs();
$('#sheet').classList.add('hide');
$('#screenResult').classList.add('hide');
$('#pauseModal').classList.add('hide');
$('#songHint').textContent = Math.round(CFG.bars * S.song.meter * 60 / S.song.bpm) + ' 秒';
$('#diffNote').textContent = '正反拍都有，判定标准';
requestAnimationFrame(loop);
