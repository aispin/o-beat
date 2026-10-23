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
const MEL_COLOR = '#FFC94D';
const GRADE_COLOR = { perfect: '#4ADE80', great: '#FFC94D', good: '#60A5FA', miss: '#4B5563' };

/* 场景：一套 shader + 一套 UI 强调色，切歌时整体换肤 */
const SCENES = {
  cyber:   { label: '赛博朋克', a: '#FF3FA4', b: '#35E0FF', glow: 'rgba(255,63,164,0.42)' },
  classic: { label: '音乐家的房间', a: '#FFB259', b: '#E0762F', glow: 'rgba(255,178,89,0.40)' },
  lofi:    { label: '慵懒房间', a: '#FFB066', b: '#7D9BC4', glow: 'rgba(255,176,102,0.36)' },
  rock:    { label: 'Live 舞台', a: '#FF4A3D', b: '#FFC98A', glow: 'rgba(255,74,61,0.44)' },
};

/* 当前主题：CSS 用变量，Canvas 用 rgb 三元组，两边必须同源 */
const THEME = { a: '#35D0BA', b: '#5B8CFF', rgb: [53, 208, 186], rgbStr: '53,208,186', rgbBStr: '91,140,255' };

function hexToRgb(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.replace(/./g, '$&$&');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* 在 RGB 基础上加透明度的便捷写法：ta = 主强调色，tb = 次强调色 */
function ta(alpha) { return 'rgba(' + THEME.rgbStr + ',' + alpha + ')'; }
function tb(alpha) { return 'rgba(' + THEME.rgbBStr + ',' + alpha + ')'; }

/* 节奏模式的「风格」：一种风格 = 一个拍号 + 一套重音轮廓 + 一批特征动机。
   BPM 由玩家调，风格只给缺省值和律动倾向。场景跟着风格换，切风格＝整套换肤。 */
const STYLES = {
  straight: {
    id: 'straight', label: 'Straight', cn: '直拍', scene: 'lofi',
    meter: [4, 4], bpm: 84,
    accent: [1, 0.45, 0.72, 0.45, 0.9, 0.45, 0.72, 0.45],
    divs: [1, 2, 3, 4, 5, 6, 8],
    pool: [4, 3, 2, 1.5, 1, 0.75, 0.5],
    motifs: [[1, 1, 1, 1], [2, 1, 1], [1.5, 0.5, 1, 1]],
  },
  swing: {
    id: 'swing', label: 'Swing', cn: '摇摆', scene: 'classic',
    meter: [4, 4], bpm: 96,
    accent: [1, 0.4, 0.55, 0.4, 0.95, 0.4, 0.55, 0.4],
    divs: [1, 2, 4, 8],
    pool: [2, 1.5, 1, 0.5],
    motifs: [[1, 1, 1.5, 0.5], [2, 1, 1], [1.5, 0.5, 1, 1]],
  },
  bossa: {
    id: 'bossa', label: 'Bossa Nova', cn: '波萨诺瓦', scene: 'cyber',
    meter: [4, 4], bpm: 92,
    accent: [1, 0.45, 0.62, 0.5, 0.86, 0.45, 0.62, 0.5],
    divs: [1, 2, 4, 8],
    pool: [2, 1.5, 1, 0.75, 0.5],
    motifs: [[1.5, 1.5, 1], [1, 1.5, 1, 0.5], [0.5, 1, 0.5, 1, 1]],
  },
  mathrock: {
    id: 'mathrock', label: 'Math Rock', cn: '数学摇滚', scene: 'rock',
    meter: [7, 8], bpm: 120,
    accent: [1, 0.55, 0.55, 0.9, 0.55, 0.8, 0.55],
    divs: [7],
    pool: [1.5, 1, 0.75, 0.5],
    motifs: [[1.5, 1, 1], [1, 1.5, 1], [0.5, 0.5, 0.75, 0.75, 1]],
  },
};
const STYLE_ORDER = ['straight', 'swing', 'bossa', 'mathrock'];

/* 一小节有多少个四分音符（7/8 → 3.5） */
function barBeatsOf(st) { return st.meter[0] * 4 / st.meter[1]; }

/* 节奏模式一局的长度：48 小节，每 16 小节 +10 BPM */
const RHYTHM_BARS = 48;
const RHYTHM_SEG = 16;
const RHYTHM_STEP = 10;

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
let canvas = null;
let ctx = null;
const view = { w: 0, h: 0, dpr: 1 };

const S = {
  phase: 'home',
  mode: 'drummer',
  song: SONGS[0],
  pick: 'neon',
  diff: 'normal',
  style: 'straight',
  bpmBase: STYLES.straight.bpm,
  lastBpm: STYLES.straight.bpm,
  bars: [],
  barNow: 0,
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
  style: 'straight',
  bpm: 0,
}, JSON.parse(localStorage.getItem('omb.settings') || '{}'));

// BPM 不跨会话：每次冷启动都回落到当前风格的缺省值。
// 否则「加快速度继续」把上一轮的 174 存住了，第二天打开就是一场打不动的局。
settings.bpm = 0;

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
    casual: '每小节时值完全一样 · 只判落点',
    normal: '加入附点，随机串入其他时值 · 只判落点',
    strict: '更杂乱但仍在风格里 · 长音符要按满',
  },
};

/* 设置落盘：只在用户真的改了东西时写，读在模块初始化那一次 */
function persist() {
  try { localStorage.setItem('omb.settings', JSON.stringify(settings)); } catch (e) { /* 隐私模式 */ }
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

/* 一屏装下多少个小节。2.15 ≈ 看到两个完整格子 + 第三个刚冒头，
   让"上一小节 / 这一小节 / 下一小节"能同时入眼，小节感才立得住。 */
const BAR_LOOK = 2.15;

/* 松手时值判定：只有挑战档才判"有没有按满"。
   入门/熟练只判落点 —— 时值本身已经靠"块的长度"在教，再叠加手部计时
   会把练习变成罚站。 */
const HOLD_JUDGE = { casual: false, normal: false, strict: true };
function holdJudge() { return !!HOLD_JUDGE[S.diff]; }

/* 时值块之间留的缝。太小就糊成一条色带，小节里"有几个音"看不出来。 */
const NOTE_GAP = 6;

/* 一小节等分：easy 的核心规则 —— 每小节所有音时值完全一样。
   全音符 / 2 个二分 / 3 个三连音 / 4 个四分 / 5 个五连 / 6 个六连，
   都只是"这一小节切成 N 份"的不同 N。 */
function uniformBar(st, barBeats, rnd) {
  const divs = st.divs.filter((n) => barBeats / n >= 0.26);   // 别切出敲不动的碎片
  const N = divs[Math.floor(rnd() * divs.length)] || 1;
  const d = barBeats / N;
  const slots = [];
  for (let i = 0; i < N; i++) slots.push({ d, rest: false });
  return slots;
}

/* 允许出现的时值（拍）。只有这张表里的值才有名字、才画得出准确的块长。
   切分必须从表里凑，不能用比例硬切 —— 按 0.75 切一个 1.5 会得到 1.125，
   再切一次就是 0.44，玩家根本没法从长度上认出那是什么音符。 */
const DUR_SET = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.25];
const EPS = 1e-6;
const near = (a, b) => Math.abs(a - b) < EPS;

/* 把一个时值拆成 2~3 个"有名字"的时值。0.75 + 0.25 就是附点组合，
   所以"加入附点"和"串入其他时值"在实现上是同一件事。 */
function splitSpan(span, rnd, strict) {
  const minD = 0.24;
  const out = [];

  for (let i = 0; i < DUR_SET.length; i++) {
    const a = DUR_SET[i];
    if (a > span - minD + EPS) continue;
    const b = span - a;
    if (b < minD - EPS) continue;
    if (DUR_SET.some((x) => near(x, b))) out.push([a, b]);
  }

  if (strict) {
    for (let i = 0; i < DUR_SET.length; i++) {
      for (let j = 0; j < DUR_SET.length; j++) {
        const a = DUR_SET[i], b = DUR_SET[j];
        const c = span - a - b;
        if (c < minD - EPS) continue;
        if (!DUR_SET.some((x) => near(x, c))) continue;
        out.push([a, b, c]);
      }
    }
  }

  if (!out.length) return null;
  return out[Math.floor(rnd() * out.length)];
}

/* 熟练 / 挑战：先按等分铺底，再随机把几个音换成别的时值组合。
   有一定概率直接套一条风格动机 —— 那是"往风格靠"最直接的来源。 */
function mixedBar(st, barBeats, rnd) {
  const strict = S.diff === 'strict';

  if (rnd() < (strict ? 0.4 : 0.34)) {
    const m = st.motifs[Math.floor(rnd() * st.motifs.length)];
    return m.map((d) => ({ d, rest: false }));
  }

  // 铺底只用"整小节 / 二分 / 四分"这种一眼能认出来的等分。
  // 熟练档不给八分铺底，否则一整小节全是 0.5，比 challenge 还密。
  const bases = strict ? [1, 2, 3, 4, 7, 8] : [1, 2, 3, 4, 7];
  const coarse = bases.filter((n) => {
    const d = barBeats / n;
    return near(d, barBeats) || (d >= 0.5 - EPS && DUR_SET.some((x) => near(x, d)));
  });
  const N = coarse[Math.floor(rnd() * coarse.length)] || 1;
  const slots = [];
  for (let i = 0; i < N; i++) slots.push({ d: barBeats / N, rest: false });

  const edits = strict ? 2 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 2);
  for (let k = 0; k < edits; k++) {
    const idx = [];
    slots.forEach((s, i) => { if (s.d >= 0.5 - EPS) idx.push(i); });
    if (!idx.length) break;
    const i = idx[Math.floor(rnd() * idx.length)];
    const sub = splitSpan(slots[i].d, rnd, strict);
    if (sub) slots.splice(i, 1, ...sub.map((d) => ({ d, rest: false })));
  }
  return slots;
}

/* 休止：入门档上限 = 音符数的一半，且不连续；熟练以上只保证不连续 */
function placeRests(slots, rnd, cap, prob = 0.22) {
  let placed = 0, run = 0;
  for (let i = 0; i < slots.length; i++) {
    if (cap != null && placed >= cap) break;
    if (i === 0) { run = 0; continue; }                 // 首拍几乎不留白
    if (run > 0) { run = 0; continue; }                 // 不连续两个休止
    if (rnd() < prob) { slots[i].rest = true; placed++; run = 1; }
  }
  if (slots.every((s) => s.rest)) slots[0].rest = false;
}

function genBar(st, barBeats, rnd) {
  const casual = S.diff === 'casual';
  const slots = casual ? uniformBar(st, barBeats, rnd) : mixedBar(st, barBeats, rnd);

  // 硬约束：一小节必须正好填满，不留悬空
  const sum = slots.reduce((a, s) => a + s.d, 0);
  if (!near(sum, barBeats) && slots.length) {
    slots[slots.length - 1].d += barBeats - sum;
  }

  // 休止上限。入门档要满足"休止数 ≤ 音符数的一半"：
  // rests ≤ (n - rests)/2 → rests ≤ n/3，取 floor。一格两格的短小节因此完全不留白。
  // 另两档放宽到半小节（floor(n/2)），但仍不允许整小节静音。
  const cap = casual ? Math.floor(slots.length / 3) : Math.floor(slots.length / 2);
  placeRests(slots, rnd, cap, casual ? 0.28 : 0.22);
  return slots;
}

function buildRhythmChart() {
  const st = STYLES[S.style] || STYLES.straight;
  const barBeats = barBeatsOf(st);
  // 每局都不一样：用时间 + 随机数做种子
  const seed = ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0) || 7;
  const rnd = mulberry32(seed);

  const notes = [];
  const rests = [];
  const bars = [];
  let id = 0;
  const push = (n) => { n.id = id++; notes.push(n); };

  // 时间轴：48 小节，每 16 小节 +10 BPM。速度一变，小节在屏幕上也变矮，
  // 所以每小节自带 dur，绘制一律按各自的小节时长换算。
  let t = 0;
  for (let i = 0; i < RHYTHM_BARS; i++) {
    const seg = Math.floor(i / RHYTHM_SEG);
    const bpm = S.bpmBase + seg * RHYTHM_STEP;
    const dur = barBeats * (60 / bpm);
    bars.push({ i, t, dur, bpm, seg, beats: barBeats, ticks: st.meter[0], den: st.meter[1] });
    t += dur;
  }
  S.bars = bars;
  S.lastBpm = bars[bars.length - 1].bpm;

  bars.forEach((bar) => {
    const beatSec = 60 / bar.bpm;
    const slots = genBar(st, barBeats, rnd);
    let pos = 0;
    slots.forEach((s) => {
      const common = {
        track: 'rhythm', col: 0, bar: bar.i,
        time: bar.t + pos * beatSec,
        dur: s.d * beatSec,
        beats: s.d,
      };
      if (s.rest) {
        const r = Object.assign({}, common, { type: 'rest', status: 'rest' });
        push(r); rests.push(r);
      } else {
        push(Object.assign({}, common, {
          type: s.d >= 1 - 1e-6 ? 'hold' : 'tap',
          dotted: [3, 1.5, 0.75].some((x) => Math.abs(x - s.d) < 1e-6),
          trip: null,
          status: 'pending', grade: null,
        }));
      }
      pos += s.d;
    });
  });

  notes.sort((a, b) => a.time - b.time);
  S.rests = rests;
  S.totalDur = t;
  return notes;
}

/* ============================================================
   布局
   ============================================================ */
function curStyle() { return STYLES[S.style] || STYLES.straight; }
function curBpm() { return settings.bpm > 0 ? settings.bpm : curStyle().bpm; }

/* 第一小节的时长：整局的滚动速度由它定，后面 BPM 变高只会让格子变矮 */
function rhythmFirstBarDur() {
  if (S.bars && S.bars.length) return S.bars[0].dur;
  return barBeatsOf(curStyle()) * (60 / curBpm());
}

function computeLayout() {
  const W = view.w, H = view.h;
  const judgeY = H * CFG.layout.judge;
  // 节奏模式按小节定速：一屏正好看到约 2 个小节格子。
  // 速度是"像素/秒"，全程不变；BPM 升上去时同一小节占的秒数变少，
  // 格子自然变矮 —— 加速这件事本身就看得见。
  let speed;
  if (S.mode === 'rhythm') {
    const look = rhythmFirstBarDur() * BAR_LOOK + 0.6;
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
    L.barGap = 4;
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
    // 左右各留 30px 槽边：块比格子窄一圈，格子轮廓才看得出来；
    // 右侧槽边同时是小节号的位置，数字不会压在块上。
    return { cx: L.lane.x + L.lane.w / 2, w: L.lane.w - 60 };
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
  if (n.track === 'rhythm') return n.type === 'rest' ? '#8C94A6' : THEME.a;
  if (n.track === 'drum') return DRUM_COLOR[n.col];
  if (n.track === 'pad') return THEME.b;
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
      pg.addColorStop(0, tb(0.13));
      pg.addColorStop(1, tb(0.02));
      c.fillStyle = pg;
      c.fillRect(0, 0, L.pad.w, H);
      c.strokeStyle = tb(0.28);
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
      c.fillStyle = THEME.b;
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

/* 卷帘底 + 小节格子
   ------------------------------------------------------------
   每个小节都是一个高度完全相同的容器 —— 这是"小节"这个单位能被
   感知到的唯一办法。格子里再按时值切成长短不一的块，于是
   「一小节里塞了几个音」和「每个音多长」能同时读出来。
   没有格子的连续色带，看起来永远是一条会动的胶带，没有节。 */
function drawRhythmLane() {
  const L = S.layout, c = ctx;
  const x = L.lane.x, w = L.lane.w;
  const top = L.top;

  // 压暗的卷帘底：保证块与灰段都能看清。
  // 必须够重 —— rock 场景的灯柱扫过来时是接近白色的，
  // 0.4 的遮罩压不住，块会整片消失。
  const g = c.createLinearGradient(0, top, 0, L.judgeY);
  g.addColorStop(0, 'rgba(8,10,16,0.58)');
  g.addColorStop(0.75, 'rgba(8,10,16,0.70)');
  g.addColorStop(1, 'rgba(8,10,16,0.84)');
  c.fillStyle = g;
  c.fillRect(x, top, w, L.judgeY - top);

  c.strokeStyle = 'rgba(255,255,255,0.10)';
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(x + 0.5, top); c.lineTo(x + 0.5, L.judgeY); c.stroke();
  c.beginPath(); c.moveTo(x + w - 0.5, top); c.lineTo(x + w - 0.5, L.judgeY); c.stroke();

  const t = Math.max(0, elapsed());
  visibleBars(t).forEach((v) => drawRhythmBar(v.b, v.y0, v.h, t));
}

/* 当前可见的小节：y 与高度都按各自的小节时长算。
   BPM 每 16 小节升一档，同一小节占的秒数变少 → 格子变矮，
   所以不能再用一个全局 barH。 */
function visibleBars(t) {
  const L = S.layout;
  const out = [];
  const bars = S.bars;
  if (!bars || !bars.length) return out;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const bottom = L.judgeY - (b.t - t) * L.speed;
    const bh = b.dur * L.speed;
    const y0 = bottom - bh + L.barGap / 2;
    const h = bh - L.barGap;
    if (bottom < L.top - 4 || y0 > L.judgeY + 4) continue;
    out.push({ b, bottom, y0, h });
  }
  return out;
}

/* 单个小节格子：底、描边、拍刻度 */
function drawRhythmBar(b, y0, h, t) {
  const L = S.layout, c = ctx;
  const x = L.lane.x, w = L.lane.w;
  const beatN = b.ticks || 4;
  const live = t >= b.t && t < b.t + b.dur;

  c.save();
  c.beginPath();
  c.rect(x, L.top, w, L.judgeY - L.top);
  c.clip();

  // 暗槽：格子底比卷帘底更深，块就成了"浮在槽里的亮条"，
  // 比给格子加亮边更容易读出容器边界。
  c.fillStyle = live ? 'rgba(2,3,7,0.50)' : 'rgba(2,3,7,0.34)';
  roundRect(c, x + 3, y0, w - 6, h, 9);
  c.fill();
  c.strokeStyle = live ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.21)';
  c.lineWidth = 1;
  c.stroke();

  // 拍刻度：格子左缘的一排小横线，数得出这一小节有几拍
  for (let k = 0; k <= beatN; k++) {
    const yy = y0 + h - (h / beatN) * k;
    if (yy < y0 + 3 || yy > y0 + h - 3) continue;
    c.strokeStyle = (k === 0 || k === beatN)
      ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.14)';
    c.beginPath();
    c.moveTo(x + 5, yy);
    c.lineTo(x + 16, yy);
    c.stroke();
  }
  c.restore();
}

/* 小节线 + 小节号，最后绘制。
   缝隙只有 4px，光靠留白分不出小节，所以每个分界补一条贯穿轨道的小节线；
   块几乎占满格子，小节点必须先画就可能被盖住，必须走这一遍。 */
function drawRhythmBarMarks() {
  const L = S.layout, c = ctx;
  const t = Math.max(0, elapsed());
  const x = L.lane.x, w = L.lane.w;

  c.save();
  c.beginPath();
  c.rect(x, L.top, w, L.judgeY - L.top);
  c.clip();
  c.textAlign = 'right';
  c.textBaseline = 'top';
  c.font = '700 9px -apple-system, sans-serif';

  visibleBars(t).forEach(({ b, bottom, y0, h }) => {
    if (h < 24) return;
    const live = t >= b.t && t < b.t + b.dur;

    // 小节线：落在两格之间那道 4px 缝的正中，不通到格子里，
    // 这样它是"分界"而不是"把块切断"。必须够亮 —— 缝隙只有 4px，
    // 一条 0.2 alpha 的细线在暗底上等于没画。
    if (b.i > 0) {
      const sepY = bottom - b.dur * L.speed;
      if (sepY > L.top + 1) {
        c.strokeStyle = live ? ta(0.62) : 'rgba(255,255,255,0.34)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(x + 3, sepY + 0.5);
        c.lineTo(x + w - 3, sepY + 0.5);
        c.stroke();
      }
    }

    // 小节号：格子内部右上角，落在块的右侧槽边里，不压块
    c.fillStyle = live ? ta(0.92) : 'rgba(255,255,255,0.46)';
    c.fillText(String(b.i + 1), x + w - 10, y0 + 6);
  });
  c.restore();
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
    grad.addColorStop(0, ta(0.08 + press * 0.16));
    grad.addColorStop(1, ta(0.02 + press * 0.05));
  }
  c.fillStyle = grad;
  roundRect(c, pad.x, pad.y, pad.w, pad.h, 20);
  c.fill();

  c.strokeStyle = rest
    ? 'rgba(140,148,166,' + (0.20 + press * 0.25) + ')'
    : ta(0.20 + press * 0.42);
  c.lineWidth = 1.5;
  c.stroke();

  const cx = pad.x + pad.w / 2;
  const cy = pad.y + pad.h / 2;

  // 中心圆：按下时扩散
  const r = 20 + press * 8;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fillStyle = rest ? 'rgba(140,148,166,0.10)' : ta(0.09 + press * 0.20);
  c.fill();
  c.strokeStyle = rest ? 'rgba(140,148,166,0.30)' : ta(0.36 + press * 0.4);
  c.lineWidth = 1.2;
  c.stroke();

  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if (rest) {
    c.fillStyle = 'rgba(196,204,220,0.82)';
    c.font = '600 13px -apple-system, sans-serif';
    c.fillText('休 止', cx, cy);
    c.fillStyle = 'rgba(196,204,220,0.44)';
    c.font = '500 10px -apple-system, sans-serif';
    c.fillText('这一段别敲', cx, cy + 32);
  } else {
    c.fillStyle = ta(0.78 + press * 0.22);
    c.font = '600 13px -apple-system, sans-serif';
    c.fillText('敲 击', cx, cy);
    c.fillStyle = ta(0.44 + press * 0.3);
    c.font = '500 10px -apple-system, sans-serif';
    c.fillText(holdJudge() ? '长音符按住到尾巴' : '跟着拍子敲下去', cx, cy + 32);
  }
  c.restore();
}

function drawRhythmNote(n, t) {
  const L = S.layout, c = ctx;
  const g = noteGeom(n);
  const bar = S.bars[n.bar];
  if (!bar) return;
  const barBottom = L.judgeY - (bar.t - t) * L.speed;
  // 块不完全按 dur×speed 算，而是按"在这一小节里占几成"换算 ——
  // 这样无论小节多长，块都严格落在格子内，全音符正好填满一格。
  const p0 = clamp((n.time - bar.t) / bar.dur, 0, 1);
  const p1 = clamp((n.time + n.dur - bar.t) / bar.dur, 0, 1);
  const inner = bar.dur * L.speed - L.barGap;
  const yOf = (p) => barBottom - L.barGap / 2 - p * inner;

  const bottom = yOf(p0);
  const top = yOf(p1) + NOTE_GAP;   // 相邻两块之间永远有一条缝
  const h = Math.max(7, bottom - top);
  if (bottom < L.top - 30 || top > L.H + 30) return;
  if (h < 2) return;

  const x = g.cx - g.w / 2, w = g.w;
  const beat = 60 / bar.bpm;

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
  const color = missed ? '#3A4150' : (n.trip != null ? THEME.b : THEME.a);
  c.globalAlpha = missed ? 0.24 : 1;

  const grad = c.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, hexA(color, holding ? 0.40 : 0.30));
  grad.addColorStop(0.55, hexA(color, holding ? 0.52 : 0.42));
  grad.addColorStop(1, hexA(color, holding ? 0.64 : 0.56));

  // 先铺一层深底：任何场景下都要能读清
  c.fillStyle = missed ? 'rgba(26,30,38,0.6)' : 'rgba(9,12,18,0.66)';
  roundRect(c, x, top, w, Math.max(6, h), 10);
  c.fill();

  c.fillStyle = grad;
  c.fill();

  c.strokeStyle = hexA(color, missed ? 0.16 : 0.62);
  c.lineWidth = 1.4;
  c.stroke();

  // 内部拍线：几拍一眼看出（按格子的比例走，和块边界对齐）
  if (n.dur > beat * 1.15) {
    c.strokeStyle = hexA(color, 0.20);
    c.lineWidth = 1;
    for (let k = 1; k * beat < n.dur - 1e-6; k++) {
      const yy = bottom - (k * beat / bar.dur) * inner;
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

/* 时值标签：全用乐谱上的分数写法。
   「1.33 拍」这种读数没人看得懂，能写成 1⅓ 就写成 1⅓。 */
const BEAT_LABEL = [
  [4, '4'], [3.5, '3½'], [3, '3'], [8 / 3, '2⅔'], [2, '2'], [1.5, '1½'],
  [4 / 3, '1⅓'], [1, '1'], [0.8, '⅘'], [0.75, '¾'], [2 / 3, '⅔'], [0.5, '½'], [0.25, '¼'],
];
function fmtBeats(b) {
  for (let i = 0; i < BEAT_LABEL.length; i++) {
    if (Math.abs(b - BEAT_LABEL[i][0]) < 1e-6) return BEAT_LABEL[i][1];
  }
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
  grad.addColorStop(0, ta(0.07));
  grad.addColorStop(0.55, ta(0.015));
  grad.addColorStop(1, ta(0));
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
  const accent = THEME.rgbStr;

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
      c.fillStyle = hexA(color, 0.16);
      c.strokeStyle = hexA(color, 0.55);
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
  if (S.mode === 'rhythm') {
    drawRhythmFade();
    drawRhythmBarMarks();
  }
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

  if (grade !== 'miss') {
    S.combo++;
    if (S.combo > S.maxCombo) S.maxCombo = S.combo;
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
    flash();
  }
}

function updateComboUI() {
  // 连击数字与打击闪光交给 UI：重新挂载 = 重放动画，比手动改 style 干净
  bumpCombo();
  emit();
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

    const full = holdJudge();

    if (best.type === 'hold') {
      best.status = 'holding';
      best.grade = grade;
      best.heldFrom = t;
      best.pid = pid;
      S.holds.set('rhythm', best);
      const g = geom(best);
      if (full) {
        // 挑战档：起音先给 60%，松手结算剩下的 40%
        addScore(CFG.score[grade] * 0.6, g.x, g.y, grade);
      } else {
        // 入门/熟练：只判落点，一次给满。长音符仍会亮起，只是不追究按多久
        addScore(CFG.score[grade], g.x, g.y, grade);
      }
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
  n.status = 'done';
  if (!holdJudge()) return;   // 只判落点的档位：松手即结束，不追究按了多久

  const end = n.time + n.dur;
  const ratio = clamp((t - n.time) / n.dur, 0, 1);
  const ok = t >= end - 0.14;
  n.heldRatio = ratio;

  S.holdSum += ok ? 1 : ratio;
  S.holdCount++;
  if (!ok) S.stats.short++;

  const base = CFG.score[n.grade] * 0.4 * (ok ? 1 : ratio);
  S.score += Math.round(base);
  S.earned += base;
  emit();

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
    updateHudBpm(t);
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
  const t = performance.now() / 1000;
  if (t - Scene.lastDraw < 0.032) return;
  Scene.lastDraw = t;

  const live = S.phase === 'playing' || S.phase === 'paused';

  S.dim += ((live ? 1 : 0) - S.dim) * 0.09;
  S.zoneAmt += ((S.combo >= CFG.zone ? 1 : 0) - S.zoneAmt) * 0.07;
  S.energy *= 0.90;
  S.bgHue += (S.bgTarget - S.bgHue) * 0.02;

  if (!settings.sceneOn) return;

  const at = live ? elapsed() + 6 : t - Clock.t0;
  const beatDur = 60 / S.song.bpm;

  Scene.render({
    t: at,
    beat: (at / beatDur) % 1,
    bar: at / (beatDur * S.song.meter),
    pulse: live ? S.beatPulse : (0.5 + 0.5 * Math.sin(t * 1.1)) * 0.35,
    energy: S.energy,
    hue: S.bgHue / 360,
    dim: S.dim,
    zone: S.zoneAmt,
  });
}

/* 切场景：主题色写进 THEME（canvas 用）与 CSS 变量（UI 用），两边必须同源。
   CSS 变量在这里落，是因为 canvas 与 DOM 都要读，放在最底层最省事。 */
function applyScene(song) {
  const sc = SCENES[song.scene] || SCENES.lofi;

  THEME.a = sc.a;
  THEME.b = sc.b;
  THEME.rgb = hexToRgb(sc.a);
  THEME.rgbStr = THEME.rgb.join(',');
  THEME.rgbBStr = hexToRgb(sc.b).join(',');

  const root = document.documentElement.style;
  root.setProperty('--accent-a', sc.a);
  root.setProperty('--accent-b', sc.b);
  root.setProperty('--accent-glow', sc.glow);
  root.setProperty('--accent-rgb', THEME.rgbStr);
  root.setProperty('--accent-b-rgb', THEME.rgbBStr);

  if (window.Scene && Scene.gl) {
    Scene.canvas.style.opacity = settings.sceneOn ? '1' : '0';
    if (settings.sceneOn) Scene.use(song.scene);
  }
  emit();
}

function loop() {
  requestAnimationFrame(loop);
  sceneTick();
  if (S.phase === 'home' || S.phase === 'result') return;

  if (S.phase === 'playing') {
    const t = elapsed();
    update(t);
    draw();
    updateCountdown(t);
  } else if (S.phase === 'paused') {
    draw();
  }
}

/* 预备拍：只把「现在该数到几」广播出去，动画交给 React 重新挂载 */
function updateCountdown(t) {
  const next = (t < 0 && S.phase === 'playing')
    ? clamp(Math.ceil(-t / (60 / S.song.bpm)), 1, CFG.time.countdownBeats)
    : 0;
  if (next !== S.countdown) {
    S.countdown = next;
    emit();
  }
}

/* ============================================================
   开局 / 结束
   ============================================================ */
export function startRun() {
  AudioEng.init();
  AudioEng.setMute(!settings.sound);

  // 先出谱面：节奏模式会顺便排出 48 小节的时间轴与 BPM 阶梯，
  // 布局的滚动速度要靠第一小节的时长来定，所以顺序不能反。
  S.notes = buildChart();
  computeLayout();

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
  S.result = null;
  S.hudBpm = '';
  S.countdown = CFG.time.countdownBeats;
  S.phase = 'playing';

  const beat = 60 / (S.mode === 'rhythm' ? S.bars[0].bpm : S.song.bpm);
  const lead = CFG.time.countdownBeats * beat + 0.35;
  S.startTime = AudioEng.now() + lead;

  for (let i = 0; i < CFG.time.countdownBeats; i++) {
    AudioEng.click(S.startTime - (CFG.time.countdownBeats - i) * beat, i === 0);
  }

  if (S.mode === 'rhythm') {
    const st = curStyle();
    Backing.buildRhythm(S.bars, st.accent, SCENE_KIT[st.scene] || 'acoustic');
  } else {
    Backing.build(S.song, CFG.bars, 'music');
  }
  Backing.start(S.startTime, () => AudioEng.now());

  S.barNow = -1;
  updateHudBpm(0);
  emit();
}

/* 演奏中的速度读数：让「每 16 小节 +10」这件事在屏幕上看得见 */
function updateHudBpm(t) {
  if (S.mode !== 'rhythm' || !S.bars.length) {
    if (S.hudBpm !== '') { S.hudBpm = ''; emit(); }
    return;
  }
  let idx = 0;
  for (let i = 0; i < S.bars.length; i++) { if (t >= S.bars[i].t) idx = i; else break; }
  if (S.barNow !== idx) {
    S.barNow = idx;
    S.hudBpm = S.bars[idx].bpm + ' BPM · ' + (idx + 1) + '/' + S.bars.length;
    bpmSeq++;
    emit();
  }
}

function endRun() {
  if (S.phase === 'result') return;
  S.phase = 'result';
  Backing.stop();
  if (ctx) ctx.clearRect(0, 0, view.w, view.h);

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

  const rows = [
    { k: '准确率', v: acc * 100 },
    { k: '稳定度', v: stability },
    S.mode === 'rhythm' && holdJudge()
      ? { k: '时值', v: timeval }
      : { k: '完整度', v: full * 100 },
  ];

  const buckets = 21;
  const counts = new Array(buckets).fill(0);
  S.devs.forEach((d) => {
    const i = clamp(Math.floor((d + 105) / 10), 0, buckets - 1);
    counts[i]++;
  });
  const max = Math.max(1, ...counts);
  const histo = counts.map((c, i) => ({
    h: c === 0 ? 0 : Math.max(8, (c / max) * 100),
    kind: i === 10 ? 'zero' : i < 10 ? 'early' : 'late',
  }));

  const mean = S.devs.length ? S.devs.reduce((s, d) => s + d, 0) / S.devs.length : 0;
  let diag = '节奏很稳。继续把注意力放在拍子上。';
  if (mean < -40) diag = '你整体偏早 ' + Math.abs(Math.round(mean)) + 'ms，可以再等一下拍子。';
  else if (mean > 40) diag = '你整体偏慢 ' + Math.round(mean) + 'ms，试着提前一点。';
  if (S.stats.pitch > 0) diag += ' 有 ' + S.stats.pitch + ' 次音高偏移，听一听再落指。';
  if (S.mode === 'rhythm') {
    if (S.restHits > 0) diag += ' 休止里抢了 ' + S.restHits + ' 次，灰色段要留白。';
    if (S.stats.short > 0) diag += ' 有 ' + S.stats.short + ' 个长音符没按满。';
    if (S.restHits === 0 && S.stats.short === 0 && holdJudge()) {
      diag += ' 时值很干净：该停的地方停了，该拖的地方拖满了。';
    }
    if (!holdJudge()) diag += ' 这一档只判落点，去挑战档再练按满。';
    diag += ' 这一轮 ' + (S.bars[0] ? S.bars[0].bpm : curBpm()) + ' → ' + S.lastBpm + ' BPM。';
  }

  S.result = {
    grade: g,
    sub: acc >= 0.95 ? '完美演奏' : acc >= 0.88 ? '非常稳' : acc >= 0.78 ? '渐入佳境' : acc >= 0.65 ? '继续' : '慢慢来',
    score: S.score,
    maxCombo: S.maxCombo,
    rows,
    histo,
    diag,
    canSpeedUp: S.mode === 'rhythm',
    nextBpm: S.lastBpm + RHYTHM_STEP,
  };
  emit();
}

/* ============================================================
   视图快照 + 对外 API
   引擎不碰 React，也不碰 DOM 结构：所有状态变化都通过 emit() 广播出去，
   UI 只读快照、只调命令，两边靠这条窄接口解耦。
   ============================================================ */
/* 这几处 DOM 在原型里是直接操作的，这里改成打标记，
   让 React 用「重新挂载」触发同一段 CSS 动画。 */
let flashSeq = 0;
let comboSeq = 0;
let bpmSeq = 0;
function flash() { flashSeq++; }
function bumpCombo() { comboSeq++; }

let vm = null;
const listeners = new Set();

function snapshot() {
  return {
    phase: S.phase,
    mode: S.mode,
    diff: S.diff,
    style: S.style,
    pick: S.pick,
    songName: S.song.name,
    songTag: S.song.tag,
    songBpm: S.song.bpm,
    songMeter: S.song.meter,
    scene: S.song.scene,
    sceneLabel: (SCENES[S.song.scene] || SCENES.lofi).label,
    sceneOn: !!settings.sceneOn,
    bpm: curBpm(),
    styleBpm: curStyle().bpm,
    score: S.score,
    combo: S.combo,
    comboSeq,
    flashSeq,
    bpmSeq,
    hudBpm: S.hudBpm || '',
    countdown: S.countdown || 0,
    result: S.result || null,
    timbre: settings.timbre,
    settings: Object.assign({}, settings),
  };
}

function emit() {
  vm = snapshot();
  listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSnapshot() {
  if (!vm) vm = snapshot();
  return vm;
}

/* 节奏模式用「风格」生成一个虚拟曲目：拍号、场景、BPM 全部跟着风格走，
   这样 applyScene / 节拍 / 主题色都能沿用原来的通路。 */
function styleSong() {
  const st = curStyle();
  return {
    id: 'style:' + st.id, name: st.label, tag: st.cn, scene: st.scene,
    bpm: curBpm(), meter: st.meter[0], den: st.meter[1],
    root: 72, scale: 'maj', chords: ['C', 'Am', 'F', 'G'],
  };
}

/* ---- 命令 ---- */

export function setMode(mode) {
  S.mode = mode;
  // 进出节奏模式时切换「曲目 / 风格」这套语境
  S.song = mode === 'rhythm'
    ? styleSong()
    : (SONGS.find((x) => x.id === S.pick) || SONGS[0]);
  applyScene(S.song);
  computeLayout();
  emit();
}

export function setDiff(diff) {
  S.diff = diff;
  emit();
}

export function setSong(id) {
  S.pick = id;
  S.song = SONGS.find((x) => x.id === id) || SONGS[0];
  applyScene(S.song);
  emit();
}

export function setStyle(id) {
  if (!STYLES[id]) return;
  S.style = id;
  const st = curStyle();
  settings.style = id;
  settings.bpm = st.bpm;
  S.bpmBase = st.bpm;
  persist();
  S.song = styleSong();
  applyScene(S.song);
  computeLayout();
  emit();
}

export function stepBpm(delta) {
  settings.bpm = clamp(curBpm() + delta, 40, 200);
  S.bpmBase = settings.bpm;
  persist();
  emit();
}

export function setSettings(patch) {
  Object.assign(settings, patch);
  persist();
  if ('sound' in patch) AudioEng.setMute(!settings.sound);
  if ('sceneOn' in patch) applyScene(S.song);
  if ('lookahead' in patch || 'padOn' in patch) {
    if (S.phase !== 'playing' && S.phase !== 'paused') computeLayout();
  }
  emit();
}

export function pause() {
  if (S.phase !== 'playing') return;
  S.phase = 'paused';
  if (AudioEng.ctx) { S.pausedAt = AudioEng.ctx.currentTime; AudioEng.ctx.suspend(); }
  emit();
}

export function resume() {
  if (S.phase !== 'paused') return;
  if (AudioEng.ctx) {
    AudioEng.ctx.resume().then(() => {
      S.startTime += AudioEng.ctx.currentTime - S.pausedAt;
      S.phase = 'playing';
      emit();
    });
  } else {
    S.phase = 'playing';
    emit();
  }
}

export function quit() {
  if (AudioEng.ctx) AudioEng.ctx.resume();
  S.phase = 'playing';
  endRun();
}

/* 48 小节走完，BPM 再加一档，接着下一轮 */
export function speedUp() {
  S.bpmBase = S.lastBpm + RHYTHM_STEP;
  settings.bpm = S.bpmBase;
  persist();
  startRun();
}

export function again() { startRun(); }

export function goHome() {
  S.phase = 'home';
  if (ctx) ctx.clearRect(0, 0, view.w, view.h);
  emit();
}

export function press(x, pointerId) {
  if (S.phase !== 'playing') return;
  handleHit(x, pointerId);
}

export function release(pointerId) {
  if (S.phase !== 'playing') return;
  const p = S.holds.get('pad');
  if (p && p.pid === pointerId) endHold(elapsed());
  const r = S.holds.get('rhythm');
  if (r && r.pid === pointerId) endRhythmHold(elapsed());
}

/* ---- 生命周期 ---- */

let booted = false;

export function boot(opts) {
  if (booted) return;
  booted = true;

  canvas = opts.stage;
  ctx = canvas.getContext('2d');
  Clock.t0 = performance.now() / 1000;

  const glOk = window.Scene ? Scene.init(opts.glbg) : false;
  if (!glOk) console.warn('[omb] WebGL 不可用，回退纯色背景');

  if (settings.style && STYLES[settings.style]) S.style = settings.style;
  S.bpmBase = curBpm();
  applyScene(S.song);

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  window.addEventListener('pointerup', (e) => release(e.pointerId));
  window.addEventListener('pointercancel', (e) => release(e.pointerId));

  requestAnimationFrame(loop);

  if (location.search.indexOf('debug') >= 0) {
    window.__OMB = {
      get S() { return S; },
      get settings() { return settings; },
      holdJudge, elapsed, judgeRhythm, endRhythmHold, endRun,
      setMode, setDiff, setStyle, stepBpm, startRun, press, release,
    };
  }
}

export { DIFF_NOTE, STYLES, STYLE_ORDER, SONGS, TIMBRES, SCENES, CFG, RHYTHM_STEP };
