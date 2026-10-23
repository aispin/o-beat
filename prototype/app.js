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

/* 场景：一套 shader + 一套 UI 强调色，切歌时整体换肤 */
const SCENES = {
  cyber:   { label: '赛博朋克', a: '#FF3FA4', b: '#35E0FF', glow: 'rgba(255,63,164,0.42)' },
  classic: { label: '音乐家的房间', a: '#FFB259', b: '#E0762F', glow: 'rgba(255,178,89,0.40)' },
  lofi:    { label: '慵懒房间', a: '#FFB066', b: '#7D9BC4', glow: 'rgba(255,176,102,0.36)' },
  rock:    { label: 'Live 舞台', a: '#FF4A3D', b: '#FFC98A', glow: 'rgba(255,74,61,0.44)' },
};

const SONGS = [
  { id: 'neon',  name: '霓虹脉冲', tag: '电子 · 正拍', scene: 'cyber',   bpm: 84, meter: 4, root: 72, scale: 'maj', chords: ['C', 'Am', 'F', 'G'] },
  { id: 'city',  name: '城市夜行', tag: '电子 · 切分', scene: 'cyber',   bpm: 96, meter: 4, root: 67, scale: 'maj', chords: ['G', 'D', 'Em', 'C'] },
  { id: 'waltz', name: '月下圆舞', tag: '古典 · 三拍', scene: 'classic', bpm: 72, meter: 3, root: 65, scale: 'maj', chords: ['F', 'C', 'F', 'C'] },
  { id: 'breath',name: '长呼吸',   tag: '慵懒 · 长音', scene: 'lofi',    bpm: 64, meter: 4, root: 69, scale: 'min', chords: ['Am', 'F', 'C', 'G'] },
  { id: 'rain',  name: '雨窗午后', tag: '慵懒 · 五声', scene: 'lofi',    bpm: 68, meter: 4, root: 74, scale: 'maj', chords: ['D', 'G', 'A', 'D'] },
  { id: 'live',  name: '地下现场', tag: '摇滚 · 强拍', scene: 'rock',    bpm: 88, meter: 4, root: 72, scale: 'maj', chords: ['C', 'F', 'G', 'Am'] },
];

const NOTE_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PENTA = { maj: [0, 2, 4, 7, 9], min: [0, 3, 5, 7, 10] };

/* 场景 → 主奏音色 / 鼓组 */
const SCENE_INST = { cyber: 'lead', classic: 'piano', lofi: 'rhodes', rock: 'guitar' };
const SCENE_KIT = { cyber: 'techno', classic: 'acoustic', lofi: 'kpr77', rock: 'acoustic' };

/* 纯节奏模式的搞怪音色 */
const TIMBRES = [
  { id: 'wood',  name: '木鱼', ico: '<circle cx="8" cy="8.4" r="5.2"/><path d="M8 2.2v1.9"/>' },
  { id: 'bubble', name: '泡泡', ico: '<circle cx="7" cy="9" r="4.4"/><circle cx="12.6" cy="4.4" r="1.5"/>' },
  { id: 'boing', name: '弹簧', ico: '<path d="M3 12.4c1.6-5.4 3.4 2.4 5-2.4s3.2 2.4 4.6-1.6"/>' },
  { id: 'meow',  name: '喵喵', ico: '<path d="M4 12.6V5.4l2.6 2h2.8l2.6-2v7.2z"/><path d="M6.6 9.6h.01M9.4 9.6h.01"/>' },
  { id: 'duck',  name: '嘎嘎', ico: '<circle cx="5.8" cy="7" r="3"/><path d="M8.8 7H13l-1.4 2.4H8.8z"/><path d="M3.4 12.6h7"/>' },
  { id: 'type',  name: '打字机', ico: '<rect x="2.6" y="7.6" width="10.8" height="5.6" rx="1.2"/><path d="M5.4 7.6V4.4h5.2v3.2"/><path d="M4.6 10.8h6.8"/>' },
  { id: 'laser', name: '激光', ico: '<path d="M9.2 2.2L5 9h3l-1.2 4.8L11.6 7H8.6z"/>' },
  { id: 'clap',  name: '拍手', ico: '<path d="M5.4 3.4v6.4M8 2.4v7.4M10.6 3.4v6.4"/><path d="M3.8 12.4h8.4"/>' },
];

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
  stats: { perfect: 0, great: 0, good: 0, miss: 0, pitch: 0, short: 0 },
  devs: [],
  holds: new Map(),
  rests: [],
  restHits: 0,
  holdSum: 0,
  holdCount: 0,
  timbreStep: 0,
  rhythmRest: null,
  fx: [],
  floats: [],
  press: {},
  lastBeat: -1,
  beatPulse: 0,
  energy: 0,
  dim: 0,
  zoneAmt: 0,
  bgHue: 200,
  bgTarget: 200,
};

const settings = Object.assign({
  lookahead: CFG.time.defaultLookahead,
  offset: 0,
  padOn: true,
  pitchJudge: true,
  sound: true,
  sceneOn: true,
  timbre: 'wood',
}, JSON.parse(localStorage.getItem('omb.settings') || '{}'));

const DIFF_NOTE = {
  drummer: {
    casual: '只有正拍，四分音符为主',
    normal: '正反拍都有，判定标准',
    strict: '加花与切分，判定严格',
  },
  melodist: {
    casual: '音符稀疏，音名全显',
    normal: '正反拍都有，五声内循环',
    strict: '音名隐藏，只能靠听',
  },
  rhythm: {
    casual: '全音符 / 二分 / 四分，先建立时值感',
    normal: '加入八分音符、附点与休止',
    strict: '三连音、延音线、十六分',
  },
};

function saveSettings() {
  try { localStorage.setItem('omb.settings', JSON.stringify(settings)); } catch (e) {}
}

/* ============================================================
   音频适配层
   发声在 sfx.js（采样 + 物理建模 + 混响），编曲在 backing.js
   ============================================================ */
const AudioEng = {
  get ctx() { return window.SFX ? SFX.ctx : null; },

  init() {
    if (!window.SFX || !SFX.init()) return false;
    const space = S.mode === 'rhythm' ? 'practice' : S.song.scene;
    SFX.setSpace(space);
    SFX.setKit(SCENE_KIT[S.song.scene] || 'acoustic');
    SFX.setMute(!settings.sound);
    SFX.ensure();
    return true;
  },

  now() { return window.SFX ? SFX.now() : performance.now() / 1000; },
  setMute(m) { if (window.SFX) SFX.setMute(m); },
  click(t, accent) { if (window.SFX) SFX.click(t, accent); },

  /* 击打音：按模式分发 */
  playHit(note) {
    if (!window.SFX || !settings.sound) return null;
    const t = this.now();

    if (S.mode === 'rhythm') { playTimbre(t, 1); return null; }

    if (note.track === 'drum') {
      const names = ['kick', 'snare', 'hat', 'openhat'];
      SFX.drum(names[note.col] || 'kick', t, { gain: note.col === 0 ? 1 : 0.82 });
      return null;
    }
    if (note.track === 'mel') {
      const inst = SCENE_INST[S.song.scene] || 'piano';
      const midi = S.song.root + PENTA[S.song.scale][note.col];
      return SFX.note(inst, midi, t, { dur: 0.66, gain: 1 });
    }
    // PAD 长音
    return SFX.note('pad', [S.song.root - 12, S.song.root - 5, S.song.root - 12 + 7], t, {
      dur: 1.2, gain: 1,
    });
  },
};

/* 节奏模式的搞怪音色：按五声音阶轮流换音高，连打会变成一小段旋律 */
const TIMBRE_LADDER = [0, 2, 4, 7, 9, 12, 9, 7, 4, 2, 0, 4];
function playTimbre(t, vol) {
  if (!window.SFX || !settings.sound) return;
  const semi = TIMBRE_LADDER[S.timbreStep % TIMBRE_LADDER.length];
  S.timbreStep++;
  SFX.sfx(settings.timbre || 'wood', t, {
    gain: vol == null ? 1 : vol,
    pitch: Math.pow(2, semi / 12),
    pan: ((S.timbreStep % 3) - 1) * 0.1,
  });
}

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
  S.rests = [];
  if (S.mode === 'rhythm') return buildRhythmChart();
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
   纯节奏模式谱面
   ------------------------------------------------------------
   一条单轨「时值带」：每个块的长度 = 它的时值，灰色块 = 休止。
   全音符是一整条，两个二分音符是两段，二分 + 四分休止就是
   一段彩色接一段灰。附点、延音线、三连音都直接体现在长度上。
   每局随机生成。
   ============================================================ */
const DUR_LABEL = { 4: '全', 3: '附点二分', 2: '二分', 1.5: '附点四分', 1: '四分', 0.75: '附点八分', 0.5: '八分', 0.25: '十六分' };

function buildRhythmChart() {
  const song = S.song;
  const beat = 60 / song.bpm;
  const meter = song.meter;
  const barDur = beat * meter;
  // 每局都不一样：用时间 + 随机数做种子
  const seed = ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0) || 7;
  const rnd = mulberry32(seed);

  const pool = {
    casual: [3, 2, 1],
    normal: [3, 2, 1.5, 1, 0.5],
    strict: [3, 2, 1.5, 1, 0.75, 0.5, 0.25],
  }[S.diff].filter((d) => d <= meter + 1e-6);

  const weight = { 3: 2.0, 2: 2.6, 1.5: 1.5, 1: 2.8, 0.75: 1.0, 0.5: 1.6, 0.25: 0.55 };
  const restP = { casual: 0.10, normal: 0.20, strict: 0.24 }[S.diff];

  const notes = [];
  const rests = [];
  let id = 0;
  const push = (n) => { n.id = id++; notes.push(n); };

  for (let bar = 0; bar < CFG.bars; bar++) {
    const t0 = bar * barDur;
    const slots = [];

    if (bar === CFG.bars - 1) {
      // 收束：一个长音落到底，不留半拍悬空
      const long = meter === 4 ? 4 : 3;
      slots.push({ d: long, rest: false });
      if (meter - long > 0.01) slots.push({ d: meter - long, rest: true });
    } else {
      let budget = meter;
      let guard = 0;
      let prev = 0;
      while (budget > 1e-6 && guard++ < 32) {
        const cands = pool.filter((d) => d <= budget + 1e-6);
        if (!cands.length) break;
        let total = 0;
        const ws = cands.map((d) => {
          const w = (weight[d] || 1) * (d === prev ? 0.3 : 1);
          total += w;
          return w;
        });
        let r = rnd() * total, d = cands[cands.length - 1];
        for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) { d = cands[i]; break; } }
        slots.push({ d, rest: false });
        budget -= d;
        prev = d;
      }

      // 休止符：保住小节第一拍，不连续两个
      let run = 0;
      slots.forEach((s, i) => {
        if (i === 0 && rnd() < 0.7) return;
        s.rest = rnd() < restP;
        if (s.rest) { if (++run >= 2) s.rest = false; } else run = 0;
      });
      if (slots.every((s) => s.rest)) slots[0].rest = false;

      // 连音线：把相邻两个实音接成一个长音，打一次按住到底
      if (S.diff !== 'casual' && rnd() < 0.5) {
        for (let i = 0; i < slots.length - 1; i++) {
          if (!slots[i].rest && !slots[i + 1].rest && rnd() < 0.35) {
            slots[i].d += slots[i + 1].d;
            slots[i].tie = true;
            slots.splice(i + 1, 1);
          }
        }
      }

      // 三连音：两个 1 拍换成 3 个 2/3 拍
      if (S.diff === 'strict' && rnd() < 0.36) {
        for (let i = 0; i < slots.length - 1; i++) {
          if (!slots[i].rest && !slots[i + 1].rest &&
              Math.abs(slots[i].d - 1) < 1e-6 && Math.abs(slots[i + 1].d - 1) < 1e-6) {
            const g = id + 1000 + bar;
            slots.splice(i, 2,
              { d: 2 / 3, rest: false, trip: g },
              { d: 2 / 3, rest: false, trip: g },
              { d: 2 / 3, rest: false, trip: g });
            break;
          }
        }
      }
    }

    let pos = 0;
    slots.forEach((s) => {
      const time = t0 + pos * beat;
      const dur = s.d * beat;
      if (s.rest) {
        const r = { track: 'rhythm', col: 0, time, dur, type: 'rest', beats: s.d, status: 'rest' };
        push(r);
        rests.push(r);
      } else {
        push({
          track: 'rhythm', col: 0, time, dur,
          type: s.d >= 1 - 1e-6 ? 'hold' : 'tap',
          beats: s.d,
          dotted: [3, 1.5, 0.75].some((x) => Math.abs(x - s.d) < 1e-6),
          tie: !!s.tie,
          trip: s.trip == null ? null : s.trip,
          status: 'pending', grade: null,
        });
      }
      pos += s.d;
    });
  }

  notes.sort((a, b) => a.time - b.time);
  S.rests = rests;
  S.totalDur = CFG.bars * barDur;
  return notes;
}

/* ============================================================
   布局
   ============================================================ */
function computeLayout() {
  const W = view.w, H = view.h;
  const judgeY = H * CFG.layout.judge;
  // 节奏模式按小节定速：整小节长音符要能装进上半屏，否则时值看不出来
  let speed;
  if (S.mode === 'rhythm') {
    const barDur = (60 / S.song.bpm) * S.song.meter;
    const look = barDur * 1.35 + 0.6;
    speed = (judgeY - CFG.layout.spawn) / look;
  } else {
    speed = (judgeY - CFG.layout.spawn) / settings.lookahead;
  }
  const L = { W, H, judgeY, speed };

  if (S.mode === 'rhythm') {
    const w = Math.min(W - 32, 430);
    L.lane = { x: (W - w) / 2, w };
    L.laneW = w;
    // 卷帘顶界：避开顶部 HUD（分数 / 暂停），长音符从这里"浮出"而不是盖住分数
    L.top = Math.round(Math.min(96, H * 0.14));
    L.pad = null;
    L.mel = null;
  } else if (S.mode === 'drummer') {
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
  if (n.track === 'rhythm') {
    return { cx: L.lane.x + L.lane.w / 2, w: L.lane.w - 12 };
  }
  if (n.track === 'drum') {
    return { cx: L.laneW * (n.col + 0.5), w: Math.min(L.laneW - 12, 52) };
  }
  if (n.track === 'pad') {
    return { cx: L.pad.x + L.pad.w / 2, w: Math.min(L.pad.w - 24, 62) };
  }
  return { cx: L.mel.x + L.mel.colW * (n.col + 0.5), w: Math.min(L.mel.colW - 9, 46) };
}

function noteColor(n) {
  if (n.track === 'rhythm') return n.type === 'rest' ? '#8C94A6' : MEL_COLOR;
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
  if (window.Scene) Scene.resize();
  computeLayout();
}

function drawLanes() {
  const L = S.layout, c = ctx, H = L.H;

  c.save();
  if (S.mode === 'rhythm') {
    drawRhythmLane();
    c.restore();
    return;
  }
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

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

/* ---------------- 纯节奏模式：时值带 ---------------- */

function drawRhythmLane() {
  const L = S.layout, c = ctx;
  const x = L.lane.x, w = L.lane.w;
  const top = L.top;

  // 压暗的卷帘底：保证块与灰段都能看清
  const g = c.createLinearGradient(0, top, 0, L.judgeY);
  g.addColorStop(0, 'rgba(8,10,16,0.42)');
  g.addColorStop(0.75, 'rgba(8,10,16,0.58)');
  g.addColorStop(1, 'rgba(8,10,16,0.72)');
  c.fillStyle = g;
  c.fillRect(x, top, w, L.judgeY - top);

  c.strokeStyle = 'rgba(255,255,255,0.10)';
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(x + 0.5, top); c.lineTo(x + 0.5, L.judgeY); c.stroke();
  c.beginPath(); c.moveTo(x + w - 0.5, top); c.lineTo(x + w - 0.5, L.judgeY); c.stroke();

  const t = Math.max(0, elapsed());
  const barDur = (60 / S.song.bpm) * S.song.meter;
  const first = Math.max(0, Math.floor(t / barDur) - 1);
  const last = Math.ceil((t + settings.lookahead + 1.4) / barDur);

  for (let b = first; b <= last; b++) {
    const y = L.judgeY - (b * barDur - t) * L.speed;
    if (y < top || y > L.judgeY + 1) continue;
    c.strokeStyle = 'rgba(255,255,255,0.10)';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.stroke();

    c.fillStyle = 'rgba(255,255,255,0.20)';
    c.font = '600 9px -apple-system, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'bottom';
    c.fillText(String(b + 1), x + 5, y - 3);
  }
}

/* 卷帘顶部的渐隐：长音符从暗处浮出，而不是被生硬切断 */
function drawRhythmFade() {
  const L = S.layout, c = ctx;
  const top = L.top, h = 54;
  const g = c.createLinearGradient(0, top, 0, top + h);
  g.addColorStop(0, 'rgba(8,10,16,0.86)');
  g.addColorStop(1, 'rgba(8,10,16,0)');
  c.save();
  c.beginPath();
  c.rect(L.lane.x, top, L.lane.w, h);
  c.clip();
  c.fillStyle = g;
  c.fillRect(L.lane.x, top, L.lane.w, h);
  c.restore();
}

function drawRhythmPad() {
  const L = S.layout, c = ctx;
  const pad = { x: L.lane.x, w: L.lane.w, y: L.judgeY + 14, h: Math.max(72, L.H - L.judgeY - 40) };
  const press = S.press.rhythm || 0;
  const rest = S.rhythmRest;

  c.save();
  const grad = c.createLinearGradient(0, pad.y, 0, pad.y + pad.h);
  if (rest) {
    grad.addColorStop(0, 'rgba(140,148,166,' + (0.10 + press * 0.08) + ')');
    grad.addColorStop(1, 'rgba(140,148,166,0.03)');
  } else {
    grad.addColorStop(0, 'rgba(255,201,77,' + (0.08 + press * 0.16) + ')');
    grad.addColorStop(1, 'rgba(255,201,77,' + (0.02 + press * 0.05) + ')');
  }
  c.fillStyle = grad;
  roundRect(c, pad.x, pad.y, pad.w, pad.h, 20);
  c.fill();

  c.strokeStyle = rest
    ? 'rgba(140,148,166,' + (0.20 + press * 0.25) + ')'
    : 'rgba(255,201,77,' + (0.20 + press * 0.42) + ')';
  c.lineWidth = 1.5;
  c.stroke();

  const cx = pad.x + pad.w / 2;
  const cy = pad.y + pad.h / 2;

  // 中心圆：按下时扩散
  const r = 22 + press * 10;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fillStyle = rest ? 'rgba(140,148,166,0.10)' : 'rgba(255,201,77,' + (0.07 + press * 0.20) + ')';
  c.fill();
  c.strokeStyle = rest ? 'rgba(140,148,166,0.24)' : 'rgba(255,201,77,' + (0.28 + press * 0.4) + ')';
  c.lineWidth = 1;
  c.stroke();

  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (rest) {
    c.fillStyle = 'rgba(180,188,204,0.66)';
    c.font = '600 13px -apple-system, sans-serif';
    c.fillText('休 止', cx, cy);
    c.fillStyle = 'rgba(180,188,204,0.34)';
    c.font = '500 10px -apple-system, sans-serif';
    c.fillText('这一段别敲', cx, cy + 20);
  } else {
    c.fillStyle = 'rgba(255,201,77,' + (0.5 + press * 0.45) + ')';
    c.font = '600 13px -apple-system, sans-serif';
    c.fillText('敲 击', cx, cy);
    c.fillStyle = 'rgba(255,201,77,0.30)';
    c.font = '500 10px -apple-system, sans-serif';
    c.fillText('长音符按住不放', cx, cy + 20);
  }
  c.restore();
}

function drawRhythmNote(n, t) {
  const L = S.layout, c = ctx;
  const g = noteGeom(n);
  const yOnset = L.judgeY - (n.time - t) * L.speed;
  const hFull = Math.max(10, n.dur * L.speed);
  const h = Math.min(hFull, L.H * 1.6);
  const top = yOnset - h;
  const bottom = yOnset;
  if (bottom < L.top - 30 || top > L.H + 30) return;

  const x = g.cx - g.w / 2, w = g.w;
  const beat = 60 / S.song.bpm;

  c.save();
  // 只画卷帘内部：上不盖 HUD，下不越过判定线（落到击打区交给 pad）
  c.beginPath();
  c.rect(L.lane.x, L.top, L.lane.w, L.judgeY + 1 - L.top);
  c.clip();

  if (n.type === 'rest') {
    const rh = Math.max(6, h - 2);
    c.fillStyle = 'rgba(20,24,32,0.55)';
    roundRect(c, x, top + 1, w, rh, 9);
    c.fill();
    c.fillStyle = 'rgba(150,160,178,0.10)';
    c.fill();

    // 斜线阴影：一眼看出"这里没有声音"
    c.save();
    roundRect(c, x, top + 1, w, rh, 9);
    c.clip();
    c.strokeStyle = 'rgba(150,160,178,0.13)';
    c.lineWidth = 1;
    for (let sx = x - rh; sx < x + w + rh; sx += 9) {
      c.beginPath();
      c.moveTo(sx, top + rh);
      c.lineTo(sx + rh, top);
      c.stroke();
    }
    c.restore();

    c.setLineDash([6, 6]);
    c.strokeStyle = 'rgba(150,160,178,0.30)';
    c.lineWidth = 1;
    roundRect(c, x, top + 1, w, rh, 9);
    c.stroke();
    c.setLineDash([]);
    if (h > 34) {
      c.fillStyle = 'rgba(190,198,214,0.50)';
      c.font = '600 11px -apple-system, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('休止 ' + fmtBeats(n.beats), g.cx, top + h / 2);
    }
    c.restore();
    return;
  }

  const missed = n.status === 'miss';
  const holding = n.status === 'holding';
  const color = missed ? '#3A4150' : (n.trip != null ? '#7DD3FC' : MEL_COLOR);
  c.globalAlpha = missed ? 0.24 : 1;

  const grad = c.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, hexA(color, 0.05));
  grad.addColorStop(0.55, hexA(color, holding ? 0.34 : 0.14));
  grad.addColorStop(1, hexA(color, holding ? 0.55 : 0.26));

  // 先铺一层深底：任何场景下都要能读清
  c.fillStyle = missed ? 'rgba(26,30,38,0.6)' : 'rgba(9,12,18,0.66)';
  roundRect(c, x, top, w, Math.max(6, h), 10);
  c.fill();

  c.fillStyle = grad;
  c.fill();

  c.strokeStyle = hexA(color, missed ? 0.16 : 0.62);
  c.lineWidth = 1.4;
  c.stroke();

  // 内部拍线：几拍一眼看出
  if (n.dur > beat * 1.15) {
    c.strokeStyle = hexA(color, 0.20);
    c.lineWidth = 1;
    for (let k = 1; k * beat < n.dur - 1e-6; k++) {
      const yy = bottom - k * beat * L.speed;
      if (yy > top + 3 && yy < bottom - 8) {
        c.beginPath();
        c.moveTo(x + 7, yy);
        c.lineTo(x + w - 7, yy);
        c.stroke();
      }
    }
  }

  // 头部：落点，必须最亮
  const hh = Math.min(9, Math.max(5, h * 0.3));
  c.fillStyle = missed ? 'rgba(90,98,114,0.5)' : color;
  roundRect(c, x, bottom - hh, w, hh, hh / 2);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.34)';
  roundRect(c, x + 4, bottom - hh + 2, w - 8, Math.max(1.5, hh * 0.3), 1);
  c.fill();

  // 时值标签：贴着头部，永远在视野里
  if (!missed && h > 22 && bottom - hh - 4 > top + 3) {
    c.fillStyle = 'rgba(255,255,255,0.66)';
    c.font = '700 10px -apple-system, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'bottom';
    c.fillText(fmtBeats(n.beats) + '拍' + (n.dotted ? '·' : ''), x + 10, bottom - hh - 5);
  }

  // 三连音标记
  if (n.trip != null && h > 14) {
    c.fillStyle = 'rgba(125,211,252,0.9)';
    c.font = '700 10px -apple-system, sans-serif';
    c.textAlign = 'right';
    c.textBaseline = 'bottom';
    c.fillText('3', x + w - 9, bottom - hh - 5);
  }

  // 连音线：顶部一个小弧，表示这条是接过来的
  if (n.tie) {
    c.strokeStyle = hexA(color, 0.72);
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(g.cx, top + 20, Math.min(28, w * 0.1), Math.PI * 1.16, Math.PI * 1.84);
    c.stroke();
  }

  // 正被按住：判定线以下亮起来
  if (holding) {
    const fromY = Math.max(top, L.judgeY);
    const toY = Math.min(L.H, Math.max(bottom, L.judgeY + 40));
    if (toY > fromY) {
      const hg = c.createLinearGradient(0, L.judgeY, 0, toY + 60);
      hg.addColorStop(0, hexA(color, 0.34));
      hg.addColorStop(1, hexA(color, 0));
      c.fillStyle = hg;
      c.fillRect(x, L.judgeY, w, toY - L.judgeY + 60);
    }
  }

  c.restore();
}

function fmtBeats(b) {
  if (Math.abs(b - 4) < 1e-6) return '4';
  if (Math.abs(b - 3) < 1e-6) return '3';
  if (Math.abs(b - 2) < 1e-6) return '2';
  if (Math.abs(b - 1.5) < 1e-6) return '1½';
  if (Math.abs(b - 1) < 1e-6) return '1';
  if (Math.abs(b - 0.75) < 1e-6) return '¾';
  if (Math.abs(b - 0.5) < 1e-6) return '½';
  if (Math.abs(b - 2 / 3) < 1e-6) return '⅔';
  return String(Math.round(b * 100) / 100);
}

function drawHitZone() {
  const L = S.layout, c = ctx;
  if (S.mode === 'rhythm') {
    drawRhythmPad();
    return;
  }
  const zoneH = L.H - L.judgeY;

  const grad = c.createLinearGradient(0, L.judgeY, 0, L.H);
  grad.addColorStop(0, 'rgba(53,208,186,0.07)');
  grad.addColorStop(0.55, 'rgba(53,208,186,0.015)');
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
  const rhythm = S.mode === 'rhythm';
  const x0 = rhythm ? L.lane.x : 0;
  const x1 = rhythm ? L.lane.x + L.lane.w : L.W;
  const accent = rhythm ? '255,201,77' : '53,208,186';

  const glow = c.createLinearGradient(0, L.judgeY - 64, 0, L.judgeY + 2);
  glow.addColorStop(0, 'rgba(' + accent + ',0)');
  glow.addColorStop(1, 'rgba(' + accent + ',' + (0.16 + pulse * 0.2) + ')');
  c.fillStyle = glow;
  c.fillRect(x0, L.judgeY - 64, x1 - x0, 66);

  c.strokeStyle = 'rgba(255,255,255,' + (0.5 + pulse * 0.4) + ')';
  c.lineWidth = 2 + pulse * 1.6;
  c.beginPath();
  c.moveTo(x0, L.judgeY);
  c.lineTo(x1, L.judgeY);
  c.stroke();

  c.strokeStyle = 'rgba(' + accent + ',' + (0.5 + pulse * 0.4) + ')';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x0, L.judgeY + 2.5);
  c.lineTo(x1, L.judgeY + 2.5);
  c.stroke();

  const step = rhythm ? 0 : (L.laneW || (L.mel ? L.mel.colW : 0));
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
  const L = S.layout;
  const horizon = (L.judgeY - CFG.layout.spawn) / L.speed + 0.5;
  const rhythm = S.mode === 'rhythm';
  for (let i = 0; i < S.notes.length; i++) {
    const n = S.notes[i];
    const dt = n.time - t;
    if (dt > horizon) break;
    if (n.status === 'done') continue;
    const tail = n.time + (n.dur || 0);
    if (tail < t - 0.5) continue;
    if (rhythm) drawRhythmNote(n, t);
    else drawNote(n, t);
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

  ctx.clearRect(0, 0, L.W, L.H);
  drawLanes();
  drawHitZone();
  drawNotes(t);
  if (S.mode === 'rhythm') drawRhythmFade();
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
  S.energy = Math.min(1.5, S.energy + (grade === 'perfect' ? 0.9 : 0.6));
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
  if (S.mode === 'rhythm') {
    judgeRhythm(t, pid);
  } else if (S.mode === 'drummer') {
    if (x < 0 || x > L.W) return;
    const lane = clamp(Math.floor(x / L.laneW), 0, 3);
    judgeDrum(lane, t);
  } else {
    if (L.pad && x < L.pad.w) { startHold(t, pid); return; }
    const col = clamp(Math.floor((x - L.mel.x) / L.mel.colW), 0, 4);
    judgeMel(col, t);
  }
}

/* ---------------- 纯节奏模式判定 ---------------- */
// 起音判时间，长音符再判松手；休止符内敲击算抢拍（只断连击，不扣分）

function activeRest(t) {
  for (let i = 0; i < S.rests.length; i++) {
    const r = S.rests[i];
    if (t >= r.time && t < r.time + r.dur) return r;
    if (r.time > t) break;
  }
  return null;
}

function judgeRhythm(t, pid) {
  const w = win();
  let best = null, bd = 1e9;
  for (let i = 0; i < S.notes.length; i++) {
    const n = S.notes[i];
    if (n.track !== 'rhythm' || n.type === 'rest' || n.status !== 'pending') continue;
    const d = Math.abs(n.time - t);
    if (d < bd) { bd = d; best = n; }
    if (n.time - t > w.good) break;
  }

  const geom = (n) => ({
    x: S.layout.lane.x + S.layout.lane.w / 2,
    y: S.layout.judgeY,
    n,
  });

  if (best && bd <= w.good) {
    const grade = gradeOf(t - best.time) || 'good';
    S.stats[grade]++;
    S.devs.push(Math.round((t - best.time) * 1000));
    S.press.rhythm = 1;
    playTimbre(AudioEng.now(), 1);

    if (best.type === 'hold') {
      best.status = 'holding';
      best.grade = grade;
      best.heldFrom = t;
      best.pid = pid;
      S.holds.set('rhythm', best);
      // 起音先给 60%，松手结算剩下的 40%
      const g = geom(best);
      addScore(CFG.score[grade] * 0.6, g.x, g.y, grade);
    } else {
      best.status = 'done';
      const g = geom(best);
      addScore(CFG.score[grade], g.x, g.y, grade);
    }
    return;
  }

  // 休止符里抢拍
  const rest = activeRest(t);
  if (rest) {
    S.restHits++;
    S.combo = 0;
    updateComboUI();
    S.press.rhythm = 1;
    if (window.SFX) SFX.sfx('buzz', AudioEng.now(), { gain: 0.5 });
    S.floats.push({
      x: S.layout.lane.x + S.layout.lane.w / 2, y: S.layout.judgeY - 40,
      text: '休止', color: '#8C94A6', t0: AudioEng.now(), life: 0.5, size: 13,
    });
    return;
  }

  // 空击：轻响，不罚
  S.press.rhythm = 1;
  playTimbre(AudioEng.now(), 0.4);
}

function endRhythmHold(t) {
  const n = S.holds.get('rhythm');
  if (!n) return;
  S.holds.delete('rhythm');

  const end = n.time + n.dur;
  const ratio = clamp((t - n.time) / n.dur, 0, 1);
  const ok = t >= end - 0.14;
  n.status = 'done';
  n.heldRatio = ratio;

  S.holdSum += ok ? 1 : ratio;
  S.holdCount++;
  if (!ok) S.stats.short++;

  const base = CFG.score[n.grade] * 0.4 * (ok ? 1 : ratio);
  S.score += Math.round(base);
  S.earned += base;
  const el = $('#hudScore');
  el.textContent = S.score;

  if (!ok) {
    S.floats.push({
      x: S.layout.lane.x + S.layout.lane.w / 2, y: S.layout.judgeY - 26,
      text: '时值 ' + Math.round(ratio * 100) + '%', color: '#FFC94D',
      t0: AudioEng.now(), life: 0.55, size: 11,
    });
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
      AudioEng.playHit({ track: 'mel', col });
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
    best.audio = AudioEng.playHit(best);
  }
}

function endHold(t) {
  const n = S.holds.get('pad');
  if (!n) return;
  S.holds.delete('pad');
  if (n.audio && n.audio.stop) n.audio.stop(AudioEng.now());
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
    if (n.type === 'rest') continue;
    const limit = (S.mode !== 'rhythm' && n.type === 'hold') ? Math.max(w.good, 0.28) : w.good;
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

  const rh = S.holds.get('rhythm');
  if (rh && t >= rh.time + rh.dur + 0.05) endRhythmHold(t);

  if (S.mode === 'rhythm') {
    S.rhythmRest = activeRest(t);
  }

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

/* ---- 场景驱动：把节拍 / 命中 / 连击喂给 GL ---- */
const Clock = { t0: 0 };

function sceneTick() {
  if (!window.Scene || !Scene.gl) return;
  const now = performance.now() / 1000;
  if (now - Scene.lastDraw < 0.032) return;
  Scene.lastDraw = now;

  const live = S.phase === 'playing' || S.phase === 'paused';

  S.dim += ((live ? 1 : 0) - S.dim) * 0.09;
  S.zoneAmt += ((S.combo >= CFG.zone ? 1 : 0) - S.zoneAmt) * 0.07;
  S.energy *= 0.90;
  S.bgHue += (S.bgTarget - S.bgHue) * 0.02;

  if (!settings.sceneOn) return;

  const t = live ? elapsed() + 6 : now - Clock.t0;
  const beatDur = 60 / S.song.bpm;

  Scene.render({
    t: t,
    beat: (t / beatDur) % 1,
    bar: t / (beatDur * S.song.meter),
    pulse: live ? S.beatPulse : (0.5 + 0.5 * Math.sin(now * 1.1)) * 0.35,
    energy: S.energy,
    hue: S.bgHue / 360,
    dim: S.dim,
    zone: S.zoneAmt,
  });
}

function applyScene(song) {
  const sc = SCENES[song.scene] || SCENES.lofi;
  document.body.dataset.scene = song.scene;
  document.body.classList.toggle('no-scene', !settings.sceneOn);
  document.documentElement.style.setProperty('--accent-a', sc.a);
  document.documentElement.style.setProperty('--accent-b', sc.b);
  document.documentElement.style.setProperty('--accent-glow', sc.glow);
  if (window.Scene && Scene.gl) {
    Scene.canvas.style.opacity = settings.sceneOn ? '1' : '0';
    if (settings.sceneOn) Scene.use(song.scene);
  }
  $('#brandScene').textContent = sc.label;
}

function loop() {
  requestAnimationFrame(loop);
  sceneTick();
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
  S.stats = { perfect: 0, great: 0, good: 0, miss: 0, pitch: 0, short: 0 };
  S.devs = [];
  S.holds.clear();
  S.restHits = 0;
  S.holdSum = 0;
  S.holdCount = 0;
  S.timbreStep = 0;
  S.rhythmRest = null;
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

  Backing.build(S.song, CFG.bars, S.mode === 'rhythm' ? 'rhythm' : 'music');
  Backing.start(S.startTime, () => AudioEng.now());

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
  ctx.clearRect(0, 0, view.w, view.h);
  document.body.classList.remove('ingame');
  document.body.classList.remove('zone');

  const total = S.notes.filter((n) => n.type !== 'rest').length || 1;
  const acc = clamp(S.earned / (total * 100), 0, 1);
  const devAbs = S.devs.length
    ? Math.sqrt(S.devs.reduce((s, d) => s + d * d, 0) / S.devs.length)
    : 0;
  const stability = clamp(100 - devAbs / 1.5, 0, 100);
  const full = clamp(1 - S.stats.miss / total, 0, 1);
  const timeval = S.holdCount ? clamp((S.holdSum / S.holdCount) * 100, 0, 100) : 100;

  let g = 'D';
  for (const [th, letter] of CFG.grade) { if (acc >= th) { g = letter; break; } }

  $('#gradeLetter').textContent = g;
  $('#gradeSub').textContent = acc >= 0.95 ? '完美演奏' : acc >= 0.88 ? '非常稳' : acc >= 0.78 ? '渐入佳境' : acc >= 0.65 ? '继续' : '慢慢来';
  $('#rScore').textContent = S.score;
  $('#rCombo').textContent = S.maxCombo;

  const rows = [
    ['准确率', acc * 100, acc * 100],
    ['稳定度', stability, stability],
    ['完整度', full * 100, full * 100],
  ];
  if (S.mode === 'rhythm') {
    rows[2] = ['时值', timeval, timeval];
  }
  renderMetrics(rows);
  renderHisto();

  const mean = S.devs.length ? S.devs.reduce((s, d) => s + d, 0) / S.devs.length : 0;
  let diag = '节奏很稳。继续把注意力放在拍子上。';
  if (mean < -40) diag = '你整体偏早 ' + Math.abs(Math.round(mean)) + 'ms，可以再等一下拍子。';
  else if (mean > 40) diag = '你整体偏慢 ' + Math.round(mean) + 'ms，试着提前一点。';
  if (S.stats.pitch > 0) diag += ' 有 ' + S.stats.pitch + ' 次音高偏移，听一听再落指。';
  if (S.mode === 'rhythm') {
    if (S.restHits > 0) diag += ' 休止里抢了 ' + S.restHits + ' 次，灰色段要留白。';
    if (S.stats.short > 0) diag += ' 有 ' + S.stats.short + ' 个长音符没按满。';
    if (S.restHits === 0 && S.stats.short === 0) diag += ' 时值很干净：该停的地方停了，该拖的地方拖满了。';
  }
  $('#diag').textContent = diag;

  showScreen('screenResult');
}

function renderMetrics(rows) {
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

function renderTimbres() {
  const cur = settings.timbre || 'wood';
  $('#timbreRow').innerHTML = TIMBRES.map((t) => (
    '<button class="timbre' + (t.id === cur ? ' on' : '') + '" data-t="' + t.id + '">' +
    '<span><svg viewBox="0 0 16 16">' + t.ico + '</svg></span><b>' + t.name + '</b></button>'
  )).join('');
  $$('#timbreRow .timbre').forEach((el) => {
    el.addEventListener('click', () => {
      settings.timbre = el.dataset.t;
      saveSettings();
      renderTimbres();
      if (window.SFX && settings.sound) {
        AudioEng.init();
        SFX.sfx(settings.timbre, AudioEng.now() + 0.02, { gain: 0.9 });
      }
    });
  });
}

/* 模式切换时，首页各块的文案与可见性 */
function updateModeChrome() {
  document.body.dataset.mode = S.mode;
  const rhythm = S.mode === 'rhythm';
  $('#diffNote').textContent = DIFF_NOTE[S.mode][S.diff];
  $('#startBtn').textContent = rhythm ? '开始练习' : '开始演奏';
  $('#songHint').textContent = rhythm
    ? '随机谱面 · ' + CFG.bars + ' 小节'
    : Math.round(CFG.bars * S.song.meter * 60 / S.song.bpm) + ' 秒';
  $('#timbreBlock').classList.toggle('hide', !rhythm);
  $('#songBlockTitle').textContent = rhythm ? '伴奏' : '曲目';
  $$('.only-melodist').forEach((el) => el.classList.toggle('dim', rhythm));
  if (rhythm) $('#foot').textContent = '跟着节拍器敲 · 灰色段要留白 · 没有失败';
  else $('#foot').textContent = '跟着拍子敲准就好 · 没有失败';
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
    '<button class="song' + (s.id === S.song.id ? ' on' : '') + '" data-id="' + s.id + '"' +
    ' style="--accent:' + (SCENES[s.scene] || SCENES.lofi).a + '">' +
    '<span class="dot"></span><b>' + s.name + '</b><span>' + s.tag + '</span>' +
    '<em>' + s.bpm + ' BPM · ' + s.meter + '/4</em></button>'
  )).join('');
  $$('#songList .song').forEach((el) => {
    el.addEventListener('click', () => {
      S.song = SONGS.find((x) => x.id === el.dataset.id);
      $$('#songList .song').forEach((x) => x.classList.remove('on'));
      el.classList.add('on');
      applyScene(S.song);
      updateModeChrome();
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
      updateModeChrome();
    });
  });

  $$('#diffSeg button').forEach((el) => {
    el.addEventListener('click', () => {
      S.diff = el.dataset.d;
      $$('#diffSeg button').forEach((x) => x.classList.remove('on'));
      el.classList.add('on');
      $('#diffNote').textContent = DIFF_NOTE[S.mode][S.diff];
      if (S.mode === 'rhythm') updateModeChrome();
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

  [['padSwitch', 'padOn'], ['pitchSwitch', 'pitchJudge'], ['sceneSwitch', 'sceneOn'], ['soundSwitch', 'sound']].forEach(([id, key]) => {
    const el = $('#' + id);
    el.classList.toggle('on', !!settings[key]);
    el.addEventListener('click', () => {
      settings[key] = !settings[key];
      el.classList.toggle('on', settings[key]);
      saveSettings();
      if (key === 'sound') AudioEng.setMute(!settings.sound);
      if (key === 'sceneOn') applyScene(S.song);
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
    ctx.clearRect(0, 0, view.w, view.h);
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
    const p = S.holds.get('pad');
    if (p && p.pid === e.pointerId) endHold(elapsed());
    const r = S.holds.get('rhythm');
    if (r && r.pid === e.pointerId) endRhythmHold(elapsed());
  };
  window.addEventListener('pointerup', releaseHold);
  window.addEventListener('pointercancel', releaseHold);

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
}

/* ---------------- 启动 ---------------- */
Clock.t0 = performance.now() / 1000;
const glOk = window.Scene ? Scene.init($('#glbg')) : false;
if (!glOk) {
  document.body.classList.add('no-scene');
  console.warn('[omb] WebGL 不可用，回退纯色背景');
}

resize();
bindUI();
renderSongs();
applyScene(S.song);
$('#sheet').classList.add('hide');
$('#screenResult').classList.add('hide');
$('#pauseModal').classList.add('hide');
renderTimbres();
updateModeChrome();
requestAnimationFrame(loop);
