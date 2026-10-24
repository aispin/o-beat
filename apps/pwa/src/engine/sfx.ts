/* ============================================================
   sfx.ts · O My Beat 音色引擎
   ------------------------------------------------------------
   原型的音频从「一次性振荡器堆叠」升级为小型混音台：

     采样 / 合成音源
        → 乐器总线（增益 · 声像 · 低切 · 高通）
        → 干声 ────────────────┐
        → 发送 → 卷积混响 ──────┤→ 胶水压缩 → 限幅 → 输出
                               └→ 磁带底噪

   设计约束：全部使用 WebAudio 1.0 标准节点，不依赖 AudioWorklet，
   以便移植到微信小程序的 WebAudioContext（ConvolverNode 不可用时
   自动降级为算法混响）。

   对外接口：
     SFX.init()                     创建上下文（必须由用户手势触发）
     SFX.ensure()                   预加载采样，返回 Promise
     SFX.setSpace('cyber')          切换空间（混响 / 延迟 / 底噪）
     SFX.setKit('techno')           切换鼓组
     SFX.drum(name, t, opt)         鼓：kick / snare / hat / openhat / tom
     SFX.note(inst, midi, t, opt)   乐器：piano / rhodes / lead / guitar / bass / pad
     SFX.sfx(name, t, opt)          搞怪音效：wood / bubble / boing / meow ...
     SFX.click(t, accent)           预备拍
     SFX.duck(t, amount)            侧链压缩（让伴奏给底鼓让位）
     SFX.now() / SFX.setMute(bool)

   这一层只依赖 WebAudio 与一个纯合成鼓组模块（lofi-kit），不依赖别的引擎模块。
   ============================================================ */

import { lofiHit, reroll as rerollLofiKit } from './lofi-kit';

/* ---------------- 类型 ---------------- */

/** 混音台总线名 */
export type BusName = 'kick' | 'snare' | 'hat' | 'bass' | 'keys' | 'pad' | 'lead' | 'fx';

/** 鼓件名 */
export type DrumName = 'kick' | 'snare' | 'hat' | 'openhat' | 'tom';

/** 音色名（合成侧；采样乐器由 bgm 模块自己放） */
export type InstName = 'piano' | 'rhodes' | 'lead' | 'chipLead' | 'chipBass' | 'guitar' | 'bass' | 'pad';

/** 搞怪音效名 */
export type SfxName = 'wood' | 'bubble' | 'boing' | 'meow' | 'duck' | 'type' | 'laser' | 'buzz' | 'clap';

export interface DrumOpt {
  gain?: number;
  kit?: string;
  pan?: number;
  /** 底鼓侧链量，0 关掉 */
  duck?: number;
  /** 音高微调（tom 用） */
  rate?: number;
}

export interface NoteOpt {
  dur?: number;
  gain?: number;
  pan?: number;
}

export interface SfxOpt {
  gain?: number;
  /** 整体音高倍数 */
  pitch?: number;
  pan?: number;
}

/** 一个可持续/可停止的声部句柄 */
export interface Voice {
  stop(at?: number): void;
}

export interface Level {
  rms: number;
  peak: number;
}

// 采样播放 / 物理建模的内部选项
interface BufOpt {
  gain?: number;
  rate?: number;
  pan?: number;
  bus?: BusName;
  lp?: number;
  dur?: number;
  fade?: number;
  human?: number;
  offset?: number;
}

interface KsOpt extends BufOpt {
  bright?: number;
  damp?: number;
  shape?: boolean;
}

interface SpaceDef {
  dur: number;
  decay: number;
  damp: number;
  pre: number;
  wet: number;
  tape: number;
  dly: number;
  dlyAmt: number;
}

interface BusDef {
  gain: number;
  send: number;
  hp: number;
  lp: number;
}

/* ---------------- 资源表 ---------------- */

// 钢琴采样：8 个锚点覆盖 C3–C6，最大移调 ±3.5 半音
const PIANO = [
  { k: 'C3', midi: 48 }, { k: 'G3', midi: 55 }, { k: 'C4', midi: 60 },
  { k: 'F4', midi: 65 }, { k: 'As4', midi: 70 }, { k: 'Ds5', midi: 75 },
  { k: 'Gs5', midi: 80 }, { k: 'C6', midi: 84 },
];

const KITS: Record<string, string[]> = {
  acoustic: ['kick', 'snare', 'hihat', 'tom1'],
  techno: ['kick', 'snare', 'hihat', 'tom1'],
  kpr77: ['kick', 'snare', 'hihat', 'tom1'],
};

// 空间预设：混响长度 / 衰减 / 高频阻尼 / 预延迟 / 湿度 / 底噪
const SPACES: Record<string, SpaceDef> = {
  cyber:    { dur: 3.1, decay: 2.9, damp: 0.60, pre: 0.012, wet: 0.30, tape: 0.000, dly: 0.245, dlyAmt: 0.20 },
  classic:  { dur: 2.5, decay: 2.3, damp: 0.38, pre: 0.028, wet: 0.42, tape: 0.000, dly: 0.000, dlyAmt: 0.00 },
  lofi:     { dur: 1.4, decay: 3.1, damp: 0.20, pre: 0.008, wet: 0.26, tape: 0.032, dly: 0.000, dlyAmt: 0.00 },
  rock:     { dur: 2.9, decay: 2.0, damp: 0.52, pre: 0.034, wet: 0.34, tape: 0.000, dly: 0.000, dlyAmt: 0.00 },
  chip:     { dur: 1.1, decay: 2.6, damp: 0.14, pre: 0.004, wet: 0.14, tape: 0.000, dly: 0.000, dlyAmt: 0.00 },
  practice: { dur: 1.6, decay: 2.6, damp: 0.34, pre: 0.010, wet: 0.24, tape: 0.000, dly: 0.000, dlyAmt: 0.00 },
};

// 乐器总线默认音量与混响发送量
const BUS_DEF: Record<BusName, BusDef> = {
  kick:  { gain: 1.00, send: 0.03, hp: 24,  lp: 9000 },
  snare: { gain: 0.86, send: 0.14, hp: 90,  lp: 9000 },
  hat:   { gain: 0.52, send: 0.07, hp: 420, lp: 13000 },
  bass:  { gain: 0.78, send: 0.03, hp: 30,  lp: 2600 },
  keys:  { gain: 0.62, send: 0.34, hp: 60,  lp: 9000 },
  pad:   { gain: 0.42, send: 0.62, hp: 70,  lp: 6000 },
  lead:  { gain: 0.56, send: 0.40, hp: 80,  lp: 11000 },
  fx:    { gain: 0.80, send: 0.26, hp: 70,  lp: 14000 },
};

/* ---------------- 内部状态 ---------------- */

interface Bus {
  g: GainNode;
  hp: BiquadFilterNode;
  lp: BiquadFilterNode;
  pan: StereoPannerNode | null;
  send: GainNode;
}

const S: {
  ac: AudioContext | null;
  out: GainNode | null;
  comp: DynamicsCompressorNode | null;
  limiter: DynamicsCompressorNode | null;
  buses: Partial<Record<BusName, Bus>>;
  revIn: GainNode | null;
  rev: ConvolverNode | null;
  revOut: GainNode | null;
  dlyIn: GainNode | null;
  dly: DelayNode | null;
  dlyOut: GainNode | null;
  dlyFb: GainNode | null;
  tape: AudioNode | null;
  tapeGain: GainNode | null;
  noise: AudioBuffer | null;
  bufs: Record<string, AudioBuffer>;
  ks: Record<string, AudioBuffer>;
  shape: Float32Array<ArrayBuffer> | null;
  space: string;
  kit: string;
  mute: boolean;
  loading: Promise<boolean> | null;
  loaded: boolean;
  irCache: Record<string, AudioBuffer>;
  duckTargets: { g: GainNode; base: number }[];
} = {
  ac: null,
  out: null, comp: null, limiter: null,
  buses: {},
  revIn: null, rev: null, revOut: null,
  dlyIn: null, dly: null, dlyOut: null, dlyFb: null,
  tape: null, tapeGain: null,
  noise: null,
  bufs: {},
  ks: {},
  shape: null,
  space: 'classic',
  kit: 'acoustic',
  mute: false,
  loading: null,
  loaded: false,
  irCache: {},
  duckTargets: [],
};

/* ---------------- 工具 ---------------- */

type NodeOpts = Record<string, string | number | boolean>;

/* 节点工厂。WebAudio 的 create* 各自返回不同子类型，用重载把这层
   差异收在这里，调用方拿到的就是精确类型（只有 pan 可能为 null，
   因为老环境没有 StereoPannerNode）。 */
function mk(kind: 'gain', opts?: NodeOpts): GainNode;
function mk(kind: 'filter', opts?: NodeOpts): BiquadFilterNode;
function mk(kind: 'pan', opts?: NodeOpts): StereoPannerNode | null;
function mk(kind: 'delay', opts?: NodeOpts): DelayNode;
function mk(kind: 'shaper', opts?: NodeOpts): WaveShaperNode;
function mk(kind: 'osc', opts?: NodeOpts): OscillatorNode;
function mk(kind: string, opts?: NodeOpts): AudioNode | null;
function mk(kind: string, opts?: NodeOpts): any {
  const c = S.ac;
  if (!c) return null;
  const node: any =
    kind === 'gain' ? c.createGain() :
    kind === 'filter' ? c.createBiquadFilter() :
    kind === 'pan' ? (c.createStereoPanner ? c.createStereoPanner() : null) :
    kind === 'delay' ? c.createDelay(1.5) :
    kind === 'shaper' ? c.createWaveShaper() :
    kind === 'osc' ? c.createOscillator() : null;
  if (!node) return null;
  if (opts) {
    Object.keys(opts).forEach((k) => {
      const cur = node[k];
      // AudioParam 是只读属性，必须写 .value
      if (cur && typeof cur === 'object' && 'value' in cur) cur.value = opts[k];
      else node[k] = opts[k];
    });
  }
  return node;
}

function mtof(m: number): number { return 440 * Math.pow(2, (m - 69) / 12); }

function panner(v?: number): StereoPannerNode | null {
  const p = mk('pan');
  if (p) p.pan.value = Math.max(-1, Math.min(1, v || 0));
  return p;
}

// 轻微失谐，避免机械感
function human(v: number): number { return 1 + (Math.random() * 2 - 1) * v; }

function now(): number { return S.ac ? S.ac.currentTime : performance.now() / 1000; }

/* ---------------- 冲激响应（程序化混响） ---------------- */

function makeIR(name: string): AudioBuffer {
  const cached = S.irCache[name];
  if (cached) return cached;
  const p = SPACES[name] || SPACES.classic;
  const c = S.ac!;
  const sr = c.sampleRate;
  const len = Math.max(1, Math.floor(sr * p.dur));
  const buf = c.createBuffer(2, len, sr);
  const pre = Math.floor(sr * p.pre);

  // 简单随机数，保证每次生成的房间一致
  let seed = 9781 + name.length * 131;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      const env = Math.pow(1 - x, p.decay);
      // 高频比低频衰减快：越到尾巴越暗
      const cut = p.damp + (1 - p.damp) * Math.pow(1 - x, 2.4);
      lp += cut * ((rnd() * 2 - 1) - lp);
      d[i] = lp * env;
    }
    // 早期反射，给房间一个可辨认的边界
    const n = 7;
    for (let k = 0; k < n; k++) {
      const idx = pre + Math.floor((0.006 + rnd() * 0.085) * sr);
      if (idx < len) d[idx] += (rnd() * 2 - 1) * (0.7 - k * 0.075);
    }
    // 归一化，避免不同空间音量跳变
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) {
      const g = 0.46 / peak;
      for (let i = 0; i < len; i++) d[i] *= g;
    }
  }
  S.irCache[name] = buf;
  return buf;
}

/* ---------------- 构建 ---------------- */

function boot(): boolean {
  if (S.ac) {
    if (S.ac.state === 'suspended') void S.ac.resume();
    return true;
  }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return false;
  const c = (S.ac = new AC({ latencyHint: 'interactive' }));

  // 总线压缩：把散落的音源粘成一首歌
  const comp = (S.comp = c.createDynamicsCompressor());
  comp.threshold.value = -16;
  comp.knee.value = 26;
  comp.ratio.value = 3.2;
  comp.attack.value = 0.006;
  comp.release.value = 0.22;

  const lim = (S.limiter = c.createDynamicsCompressor());
  lim.threshold.value = -4.5;
  lim.knee.value = 0;
  lim.ratio.value = 20;
  lim.attack.value = 0.001;
  lim.release.value = 0.09;

  const out = (S.out = c.createGain());
  out.gain.value = S.mute ? 0 : 0.86;

  comp.connect(lim);
  lim.connect(out);
  out.connect(c.destination);

  // 混响
  S.revIn = c.createGain();
  S.rev = c.createConvolver();
  S.rev.normalize = true;
  S.revIn.connect(S.rev);
  S.revOut = c.createGain();
  S.revOut.gain.value = 1;
  S.rev.connect(S.revOut);
  S.revOut.connect(comp);

  // 附点八分延迟（电子 / 主音用）
  S.dlyIn = c.createGain();
  S.dly = c.createDelay(1.5);
  S.dlyFb = c.createGain();
  S.dlyFb.gain.value = 0.34;
  const dlyLp = mk('filter', { type: 'lowpass', frequency: 3200 });
  S.dlyOut = c.createGain();
  S.dlyOut.gain.value = 0;
  S.dlyIn.connect(S.dly);
  S.dly.connect(dlyLp); dlyLp.connect(S.dlyFb); S.dlyFb.connect(S.dly);
  dlyLp.connect(S.dlyOut);
  S.dlyOut.connect(comp);

  // 磁带底噪
  const tlen = Math.floor(c.sampleRate * 2);
  const tbuf = c.createBuffer(2, tlen, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = tbuf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < tlen; i++) {
      lp += 0.06 * ((Math.random() * 2 - 1) - lp);
      d[i] = lp;
    }
  }
  const tsrc = c.createBufferSource();
  tsrc.buffer = tbuf; tsrc.loop = true;
  const thp = mk('filter', { type: 'highpass', frequency: 260 });
  S.tapeGain = c.createGain();
  S.tapeGain.gain.value = 0;
  tsrc.connect(thp); thp.connect(S.tapeGain); S.tapeGain.connect(comp);
  tsrc.start();

  // 白噪声源（备用给合成鼓）
  const nlen = Math.floor(c.sampleRate * 1.0);
  const nbuf = c.createBuffer(1, nlen, c.sampleRate);
  const nd = nbuf.getChannelData(0);
  for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
  S.noise = nbuf;

  // 失真曲线（吉他 / 主音）
  const N = 2048, curve = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.4) * 0.82;
  }
  S.shape = curve;

  // 乐器总线
  (Object.keys(BUS_DEF) as BusName[]).forEach((name) => {
    const cfg = BUS_DEF[name];
    const g = mk('gain'); g.gain.value = cfg.gain;
    const hp = mk('filter', { type: 'highpass', frequency: cfg.hp, Q: 0.6 });
    const lp = mk('filter', { type: 'lowpass', frequency: cfg.lp, Q: 0.5 });
    const pan = panner(0);
    const send = mk('gain'); send.gain.value = cfg.send;

    g.connect(hp); hp.connect(lp);
    if (pan) { lp.connect(pan); pan.connect(comp); pan.connect(send); }
    else { lp.connect(comp); lp.connect(send); }
    if (S.revIn) send.connect(S.revIn);

    S.buses[name] = { g, hp, lp, pan, send };
    if (name === 'pad' || name === 'keys' || name === 'bass') {
      S.duckTargets.push({ g, base: cfg.gain });
    }
  });

  applySpace(S.space);
  void load();          // 后台预加载，失败自动用合成兜底
  return true;
}

function setMute(m: boolean): void {
  S.mute = !!m;
  if (S.out) S.out.gain.setTargetAtTime(m ? 0 : 0.86, now(), 0.02);
}

function applySpace(name: string): void {
  const p = SPACES[name] || SPACES.classic;
  if (!S.ac || !S.revOut || !S.rev) return;
  S.space = name;

  // 换 IR 时把湿度拉到 0 再换，避免爆音
  S.revOut.gain.cancelScheduledValues(now());
  S.revOut.gain.setTargetAtTime(0, now(), 0.01);
  setTimeout(() => {
    try { S.rev!.buffer = makeIR(name); } catch { /* 解码失败就保持旧 IR */ }
    S.revOut!.gain.setTargetAtTime(p.wet, now(), 0.05);
  }, 60);

  if (S.dly && S.dlyOut) {
    S.dly.delayTime.setTargetAtTime(p.dly || 0.001, now(), 0.05);
    S.dlyOut.gain.setTargetAtTime(p.dlyAmt || 0, now(), 0.05);
  }
  if (S.tapeGain) S.tapeGain.gain.setTargetAtTime(p.tape || 0, now(), 0.08);
}

function setSpace(name: string): void { if (S.ac) applySpace(name); }

/* 无采样的合成鼓组：chip 是芯片味，lofi 是软起音、高频收的套鼓 */
const SYNTH_KIT = ['chip', 'lofi'];

function setKit(name: string): void {
  const known = !!KITS[name] || SYNTH_KIT.indexOf(name) >= 0;
  S.kit = known ? name : 'acoustic';
  // 每次换到 lofi 套鼓掷一次预设（明亮 / 更暗），同一首里不再变
  if (S.kit === 'lofi') rerollLofiKit();
}

/* ---------------- 采样加载 ---------------- */

async function fetchBuf(url: string): Promise<AudioBuffer> {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(url + ' ' + res.status);
  const arr = await res.arrayBuffer();
  return await new Promise<AudioBuffer>((ok, err) => {
    const p = S.ac!.decodeAudioData(arr, ok, err);
    if (p && p.then) p.then(ok, err);
  });
}

function load(): Promise<boolean> {
  if (S.loading) return S.loading;
  const base = new URL('assets/', window.location.href).href;
  const jobs: Promise<unknown>[] = [];
  PIANO.forEach((p) => {
    jobs.push(fetchBuf(base + 'piano/' + p.k + '.mp3').then((b) => { S.bufs['piano:' + p.k] = b; }));
  });
  (Object.keys(KITS) as string[]).forEach((kit) => {
    KITS[kit].forEach((h) => {
      jobs.push(fetchBuf(base + 'drums/' + kit + '/' + h + '.mp3').then((b) => { S.bufs['drum:' + kit + ':' + h] = b; }));
    });
  });
  S.loading = Promise.all(jobs.map((j) => j.catch(() => null))).then(() => {
    S.loaded = true;
    return S.loaded;
  });
  return S.loading;
}

async function ensure(): Promise<boolean> {
  if (!S.ac) boot();
  if (S.loaded) return true;
  await Promise.race([load(), new Promise((r) => setTimeout(r, 1800))]);
  return S.loaded;
}

/* ---------------- 播放原语 ---------------- */

function busOf(name?: BusName): GainNode {
  return (name && S.buses[name] ? S.buses[name]!.g : S.buses.fx!.g);
}

// 播放采样
function playBuf(key: string, t: number, opt: BufOpt): { src: AudioBufferSourceNode; g: GainNode } | null {
  const buf = S.bufs[key];
  if (!buf) return null;
  const c = S.ac!;
  const o = opt || {};
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = (o.rate || 1) * human(o.human == null ? 0.002 : o.human);

  const g = c.createGain();
  g.gain.value = o.gain == null ? 1 : o.gain;

  let tail: AudioNode = src;
  if (o.lp) {
    const f = mk('filter', { type: 'lowpass', frequency: o.lp, Q: 0.7 });
    tail.connect(f); tail = f;
  }
  tail.connect(g);

  const pan = panner(o.pan || 0);
  if (pan) { g.connect(pan); pan.connect(busOf(o.bus)); }
  else g.connect(busOf(o.bus));

  const dur = o.dur || buf.duration;
  if (o.fade) {
    g.gain.setValueAtTime(o.gain == null ? 1 : o.gain, t);
    g.gain.setValueAtTime(o.gain == null ? 1 : o.gain, t + Math.max(0.01, dur - o.fade));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
  }

  // 必须先 start 再 stop
  if (o.offset) src.start(t, o.offset);
  else src.start(t);
  src.stop(t + dur + 0.06);

  return { src, g };
}

/* ---------------- 鼓 ---------------- */

function synthKick(t: number, v: number, bus?: BusName): void {
  const c = S.ac!;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.09);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1.1 * v, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
  o.connect(g); g.connect(busOf(bus || 'kick'));
  o.start(t); o.stop(t + 0.36);

  // 打击瞬态
  const n = c.createBufferSource(); n.buffer = S.noise;
  const hp = mk('filter', { type: 'highpass', frequency: 1800 });
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.22 * v, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
  n.connect(hp); hp.connect(ng); ng.connect(busOf(bus || 'kick'));
  n.start(t); n.stop(t + 0.03);
}

/* 芯片鼓组：正弦扫频底鼓 + 两段滤波噪声。
   BGM 用的就是这一套参数 —— 8bit 的鼓本来就是合成的，
   换成采样鼓反而不对味，所以这里不给它准备素材。 */
function chipDrum(name: DrumName, t: number, v: number): void {
  const c = S.ac!;

  if (name === 'kick') {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.085);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34 * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.21);
    o.connect(g); g.connect(busOf('kick'));
    o.start(t); o.stop(t + 0.23);
    duck(t, 0.12);
    return;
  }

  if (name === 'snare' || name === 'tom') {
    const n = c.createBufferSource(); n.buffer = S.noise;
    const bp = mk('filter', { type: 'bandpass', frequency: 1750, Q: 0.9 });
    const g = c.createGain();
    g.gain.setValueAtTime(0.12 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    n.connect(bp); bp.connect(g); g.connect(busOf('snare'));
    n.start(t); n.stop(t + 0.10);
    return;
  }

  const open = name === 'openhat';
  const d = open ? 0.16 : 0.028;
  const n = c.createBufferSource(); n.buffer = S.noise;
  const hp = mk('filter', { type: 'highpass', frequency: 6800, Q: 0.7 });
  const g = c.createGain();
  g.gain.setValueAtTime((open ? 0.10 : 0.062) * v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  n.connect(hp); hp.connect(g); g.connect(busOf('hat'));
  n.start(t, Math.random() * 0.12); n.stop(t + d + 0.02);
}

function drum(name: DrumName, t: number, opt?: DrumOpt): void {
  if (!S.ac || S.mute) return;
  const o = opt || {};
  const v = o.gain == null ? 1 : o.gain;
  const kit = o.kit || S.kit;
  const pan = o.pan || 0;

  if (kit === 'chip') { chipDrum(name, t, v); return; }

  /* lofi 套鼓：合成，不进采样路径。v 按采样鼓的同一尺度换算 ——
     采样路径自己带了 1.05 / 1 / 0.72 的系数，合成侧要跟上，
     否则一键切回采样时整体音量会跳。 */
  if (kit === 'lofi') {
    const ac = S.ac;
    const bus = name === 'kick' ? 'kick' : name === 'snare' || name === 'tom' ? 'snare' : 'hat';
    const k = name === 'kick' ? 1.05 : name === 'snare' || name === 'tom' ? 1 : name === 'openhat' ? 0.52 : 0.72;
    lofiHit(ac, busOf(bus), name, t, v * k, { pan });
    if (name === 'kick') duck(t, o.duck == null ? 0.34 : o.duck);
    return;
  }

  if (name === 'kick') {
    const r = playBuf('drum:' + kit + ':kick', t, { gain: v * 1.05, pan, bus: 'kick', human: 0.006 });
    if (!r) synthKick(t, v, 'kick');
    duck(t, o.duck == null ? 0.34 : o.duck);
    return;
  }
  if (name === 'snare') {
    const r = playBuf('drum:' + kit + ':snare', t, { gain: v, pan, bus: 'snare' });
    if (!r) {
      const c = S.ac;
      const n = c.createBufferSource(); n.buffer = S.noise;
      const bp = mk('filter', { type: 'bandpass', frequency: 1900, Q: 0.9 });
      const g = c.createGain();
      g.gain.setValueAtTime(0.5 * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      n.connect(bp); bp.connect(g); g.connect(busOf('snare'));
      n.start(t); n.stop(t + 0.17);
    }
    return;
  }
  if (name === 'hat' || name === 'openhat') {
    const open = name === 'openhat';
    const r = playBuf('drum:' + kit + ':hihat', t, {
      gain: v * (open ? 0.52 : 0.72),
      rate: open ? human(0.62) : human(1.0),
      pan: pan || (open ? -0.18 : 0.14),
      bus: 'hat',
      dur: open ? 0.42 : 0.09,
      fade: open ? 0.34 : 0.04,
      human: 0.012,
    });
    if (!r) {
      const c = S.ac;
      const n = c.createBufferSource(); n.buffer = S.noise;
      const hp = mk('filter', { type: 'highpass', frequency: 8600 });
      const g = c.createGain();
      g.gain.setValueAtTime(0.26 * v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.3 : 0.05));
      n.connect(hp); hp.connect(g); g.connect(busOf('hat'));
      n.start(t); n.stop(t + 0.32);
    }
    return;
  }
  if (name === 'tom') {
    const r = playBuf('drum:' + kit + ':tom1', t, { gain: v, rate: o.rate || 1, pan, bus: 'snare' });
    if (!r) synthKick(t, v * 0.8, 'snare');
  }
}

/* ---------------- 物理建模：拨弦（Karplus-Strong） ---------------- */

function ksBuffer(midi: number, dur: number, opt?: KsOpt): AudioBuffer {
  const key = 'ks:' + midi + ':' + (opt && opt.bright) + ':' + (opt && opt.damp) + ':' + Math.round(dur * 10);
  const cached = S.ks[key];
  if (cached) return cached;
  const c = S.ac!;
  const sr = c.sampleRate;
  const f = mtof(midi);
  const N = Math.max(2, Math.round(sr / f));
  const len = Math.max(N * 2, Math.floor(sr * dur));
  const buf = c.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);

  const bright = opt && opt.bright != null ? opt.bright : 0.55;
  const damp = opt && opt.damp != null ? opt.damp : 0.9965;

  const line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = Math.random() * 2 - 1;
  // 拨片/指尖的初始激励亮度
  let lp = 0;
  for (let i = 0; i < N; i++) { lp += bright * (line[i] - lp); line[i] = lp; }

  let idx = 0;
  for (let i = 0; i < len; i++) {
    const cur = line[idx];
    out[i] = cur;
    // 一阶低通 + 衰减，每个周期执行一次 → 高音自然衰减更快
    line[idx] = (cur + line[(idx + 1) % N]) * 0.5 * damp;
    idx = (idx + 1) % N;
  }
  // 尾部淡出，防止循环点爆音
  const fade = Math.min(len, Math.floor(sr * 0.05));
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  const atk = Math.max(2, Math.floor(sr * 0.0025));
  for (let i = 0; i < atk; i++) out[i] *= i / atk;

  S.ks[key] = buf;
  return buf;
}

function playKs(midi: number, t: number, opt?: KsOpt): Voice {
  const c = S.ac!;
  const o = opt || {};
  const dur = o.dur || 1.6;
  const buf = ksBuffer(midi, Math.min(3.2, dur + 0.6), o);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = human(0.0015);

  const g = c.createGain();
  g.gain.value = o.gain == null ? 1 : o.gain;

  let tail: AudioNode = src;
  if (o.shape) {
    const ws = mk('shaper');
    ws.curve = S.shape;
    ws.oversample = '2x';
    tail.connect(ws); tail = ws;
  }
  if (o.lp) {
    const f = mk('filter', { type: 'lowpass', frequency: o.lp, Q: 0.7 });
    tail.connect(f); tail = f;
  }
  tail.connect(g);

  const pan = panner(o.pan || 0);
  if (pan) { g.connect(pan); pan.connect(busOf(o.bus || 'keys')); }
  else g.connect(busOf(o.bus || 'keys'));

  // 时值短于自然衰减时手动收尾
  if (dur < buf.duration - 0.05) {
    const rel = 0.06;
    g.gain.setValueAtTime(g.gain.value, t + Math.max(0.02, dur - rel));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
  }
  src.start(t);
  src.stop(t + Math.min(buf.duration, dur + 0.3));

  return {
    stop: (at?: number) => {
      const x = at || now();
      g.gain.cancelScheduledValues(x);
      g.gain.setValueAtTime(g.gain.value, x);
      g.gain.linearRampToValueAtTime(0.0001, x + 0.08);
      try { src.stop(x + 0.1); } catch { /* 已停过 */ }
    },
  };
}

/* ---------------- 乐器 ---------------- */

function nearestPiano(midi: number): { k: string; midi: number } {
  let best = PIANO[0], bd = 1e9;
  for (let i = 0; i < PIANO.length; i++) {
    const d = Math.abs(PIANO[i].midi - midi);
    if (d < bd) { bd = d; best = PIANO[i]; }
  }
  return best;
}

function piano(midi: number, t: number, o: NoteOpt): Voice | null {
  const src = nearestPiano(midi);
  const buf = S.bufs['piano:' + src.k];
  const dur = o.dur || 1.6;
  const v = (o.gain == null ? 1 : o.gain);
  if (!buf) return lead(midi, t, { ...o, gain: v * 0.6 });
  const rate = Math.pow(2, (midi - src.midi) / 12);
  // 力度越大越亮
  const lp = 3200 + 9000 * Math.min(1, v);
  const r = playBuf('piano:' + src.k, t, {
    gain: v * 1.15, rate, pan: o.pan || 0, bus: 'keys', human: 0.0022,
    lp, dur: Math.min(dur + 0.5, buf.duration), fade: 0.22,
  });
  return r ? {
    stop: (at?: number) => {
      const x = at || now();
      r.g.gain.cancelScheduledValues(x);
      r.g.gain.setValueAtTime(r.g.gain.value, x);
      r.g.gain.linearRampToValueAtTime(0.0001, x + 0.16);
      try { r.src.stop(x + 0.2); } catch { /* 已停过 */ }
    },
  } : null;
}

// FM 电钢琴（Rhodes）：载波 + 调制器 + 音叉泛音，带颤音
function rhodes(midi: number, t: number, o: NoteOpt): Voice {
  const c = S.ac!;
  const f = mtof(midi);
  const dur = o.dur || 1.4;
  const v = o.gain == null ? 1 : o.gain;
  const g = c.createGain();
  const car = c.createOscillator();
  const mod = c.createOscillator();
  const modGain = c.createGain();
  car.type = 'sine'; mod.type = 'sine';
  car.frequency.value = f * human(0.0012);
  mod.frequency.value = f;
  modGain.gain.setValueAtTime(f * 2.6 * v, t);
  modGain.gain.exponentialRampToValueAtTime(f * 0.22, t + 0.55);
  mod.connect(modGain); modGain.connect(car.frequency);

  // 音叉的高频"叮"
  const tine = c.createOscillator(), tineG = c.createGain();
  tine.type = 'sine';
  tine.frequency.value = f * 6.27;
  tineG.gain.setValueAtTime(0.10 * v, t);
  tineG.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);

  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.34 * v, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.10 * v, t + 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  const lp = mk('filter', { type: 'lowpass', frequency: 2600, Q: 0.9 });
  const pan = panner(o.pan || 0);

  car.connect(g);
  tine.connect(tineG); tineG.connect(g);
  g.connect(lp);
  if (pan) { lp.connect(pan); pan.connect(busOf('keys')); } else lp.connect(busOf('keys'));

  // 慢速颤音（舞台电钢的箱体感）
  const lfo = c.createOscillator(), lfoG = c.createGain();
  lfo.frequency.value = 5.2; lfoG.gain.value = 0.055 * v;
  lfo.connect(lfoG); lfoG.connect(g.gain);

  [car, mod, tine, lfo].forEach((n) => { n.start(t); n.stop(t + dur + 0.1); });
  return {
    stop: (at?: number) => {
      const x = at || now();
      g.gain.cancelScheduledValues(x);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), x);
      g.gain.exponentialRampToValueAtTime(0.0001, x + 0.14);
      [car, mod, tine, lfo].forEach((n) => { try { n.stop(x + 0.18); } catch { /* 已停过 */ } });
    },
  };
}

// 合成主音：三层失谐锯齿 + 次低音 + 滤波包络 + 延迟
function lead(midi: number, t: number, o: NoteOpt): Voice {
  const c = S.ac!;
  const f = mtof(midi);
  const dur = o.dur || 0.55;
  const v = o.gain == null ? 1 : o.gain;
  const g = c.createGain();
  const lp = mk('filter', { type: 'lowpass', Q: 6 });
  lp.frequency.setValueAtTime(1400, t);
  lp.frequency.exponentialRampToValueAtTime(4200, t + 0.06);
  lp.frequency.exponentialRampToValueAtTime(900, t + Math.max(0.12, dur));

  const oscs: OscillatorNode[] = [];
  [-9, 0, 8].forEach((cents, i) => {
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = f * Math.pow(2, cents / 1200);
    const og = c.createGain();
    og.gain.value = i === 1 ? 0.5 : 0.28;
    osc.connect(og); og.connect(lp);
    oscs.push(osc);
  });
  const sub = c.createOscillator(), subG = c.createGain();
  sub.type = 'square';
  sub.frequency.value = f / 2;
  subG.gain.value = 0.16;
  sub.connect(subG); subG.connect(lp);
  oscs.push(sub);

  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.30 * v, t + 0.014);
  g.gain.setValueAtTime(0.30 * v, t + Math.max(0.02, dur - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  lp.connect(g);
  const pan = panner(o.pan || 0);
  if (pan) { g.connect(pan); pan.connect(busOf('lead')); } else g.connect(busOf('lead'));
  if (S.dlyIn) g.connect(S.dlyIn);

  oscs.forEach((n) => { n.start(t); n.stop(t + dur + 0.05); });
  return {
    stop: (at?: number) => {
      const x = at || now();
      g.gain.cancelScheduledValues(x);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), x);
      g.gain.exponentialRampToValueAtTime(0.0001, x + 0.1);
    },
  };
}

/* 8bit 主音：一根方波，外加一层很轻的五度。
   不挂滤波扫频、不做失谐 —— 芯片音源的性格就是「硬起音、利落收尾」，
   越干净越像，加一点混响就够。 */
function chipLead(midi: number, t: number, o: NoteOpt): Voice {
  const c = S.ac!;
  const f = mtof(midi);
  const dur = o.dur || 0.34;
  const v = o.gain == null ? 1 : o.gain;
  const g = c.createGain();

  const atk = 0.004;
  const rel = Math.min(0.032, dur * 0.35);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22 * v, t + atk);
  g.gain.setValueAtTime(0.22 * v, t + Math.max(atk + 0.004, dur - rel));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  const oscs: OscillatorNode[] = [];
  const main = c.createOscillator();
  main.type = 'square';
  main.frequency.value = f;
  main.connect(g);
  oscs.push(main);

  // 五度只在听感舒服的音域里加：方波乘 1.5 上了 5k 就变成刺耳的蜂鸣
  if (f * 1.5 < 5000) {
    const fifth = c.createOscillator();
    fifth.type = 'square';
    fifth.frequency.value = f * 1.5;
    const fg = c.createGain();
    fg.gain.value = 0.10;
    fifth.connect(fg);
    fg.connect(g);
    oscs.push(fifth);
  }

  const pan = panner(o.pan || 0);
  if (pan) { g.connect(pan); pan.connect(busOf('lead')); } else g.connect(busOf('lead'));

  oscs.forEach((n) => { n.start(t); n.stop(t + dur + 0.02); });
  return {
    stop: (at?: number) => {
      const x = at || now();
      g.gain.cancelScheduledValues(x);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), x);
      g.gain.exponentialRampToValueAtTime(0.0001, x + 0.05);
    },
  };
}

// 8bit 贝斯：三角波。那个年代的低声部没有别的选择。
function chipBass(midi: number, t: number, o: NoteOpt): Voice {
  const c = S.ac!;
  const dur = o.dur || 0.3;
  const v = o.gain == null ? 1 : o.gain;
  const g = c.createGain();

  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.30 * v, t + 0.006);
  g.gain.setValueAtTime(0.30 * v, t + Math.max(0.012, dur - 0.04));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = mtof(midi);
  osc.connect(g);
  g.connect(busOf('bass'));
  osc.start(t);
  osc.stop(t + dur + 0.02);

  return {
    stop: (at?: number) => {
      const x = at || now();
      g.gain.cancelScheduledValues(x);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), x);
      g.gain.exponentialRampToValueAtTime(0.0001, x + 0.05);
    },
  };
}

// 电吉他：拨弦模型 + 过载 + 箱体低通
function guitar(midi: number, t: number, o: NoteOpt): Voice {
  return playKs(midi, t, {
    dur: o.dur || 1.2,
    gain: (o.gain == null ? 1 : o.gain) * 0.9,
    pan: o.pan || 0,
    bus: 'lead',
    bright: 0.62,
    damp: 0.9972,
    shape: true,
    lp: 4600,
  });
}

// 贝斯：拨弦模型 + 正弦超低音
function bass(midi: number, t: number, o: NoteOpt): Voice {
  const c = S.ac!;
  const dur = o.dur || 0.5;
  const v = o.gain == null ? 1 : o.gain;
  const h = playKs(midi, t, {
    dur, gain: v * 0.9, pan: 0, bus: 'bass', bright: 0.30, damp: 0.9982, lp: 900,
  });
  const sub = c.createOscillator(), sg = c.createGain();
  sub.type = 'sine';
  sub.frequency.value = mtof(midi);
  sg.gain.setValueAtTime(0.0001, t);
  sg.gain.exponentialRampToValueAtTime(0.20 * v, t + 0.02);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  sub.connect(sg); sg.connect(busOf('bass'));
  sub.start(t); sub.stop(t + dur + 0.05);
  return h;
}

// 弦乐铺底：多层锯齿 + 慢起音 + 合唱
function pad(midis: number | number[], t: number, o: NoteOpt): Voice {
  const c = S.ac!;
  const dur = o.dur || 1.6;
  const v = o.gain == null ? 1 : o.gain;
  const g = c.createGain();
  const lp = mk('filter', { type: 'lowpass', frequency: 1800, Q: 0.6 });

  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.20 * v, t + Math.min(0.5, dur * 0.35));
  g.gain.setValueAtTime(0.20 * v, t + Math.max(0.55, dur - 0.5));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  const oscs: OscillatorNode[] = [];
  (Array.isArray(midis) ? midis : [midis]).forEach((m, i) => {
    const f = mtof(m);
    [-7, 6].forEach((cents, j) => {
      const osc = c.createOscillator();
      osc.type = i === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.value = f * Math.pow(2, cents / 1200);
      const og = c.createGain();
      og.gain.value = 0.5 / (i + 1) / (j + 1);
      osc.connect(og); og.connect(lp);
      osc.start(t); osc.stop(t + dur + 0.08);
      oscs.push(osc);
    });
  });

  // 合唱：两条调制延迟
  const pan = panner(0);
  let tail: AudioNode = lp;
  [0.013, 0.019].forEach((dt, i) => {
    const d = mk('delay'); d.delayTime.value = dt;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.14 + i * 0.07; lg.gain.value = 0.0024;
    lfo.connect(lg); lg.connect(d.delayTime);
    lfo.start(t); lfo.stop(t + dur + 0.1);
    const dg = c.createGain(); dg.gain.value = i ? 0.5 : 0.9;
    tail.connect(d); d.connect(dg); dg.connect(g);
    oscs.push(lfo);
  });
  tail.connect(g);
  if (pan) { g.connect(pan); pan.connect(busOf('pad')); } else g.connect(busOf('pad'));

  return {
    stop: (at?: number) => {
      const x = at || now();
      g.gain.cancelScheduledValues(x);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), x);
      g.gain.linearRampToValueAtTime(0.0001, x + 0.3);
      oscs.forEach((n) => { try { n.stop(x + 0.36); } catch { /* 已停过 */ } });
    },
  };
}

const INST: Record<InstName, (midi: number, t: number, o: NoteOpt) => Voice | null> = {
  piano, rhodes, lead, chipLead, chipBass, guitar, bass, pad,
};

function note(inst: InstName | string, midi: number | number[], t?: number, opt?: NoteOpt): Voice | null {
  if (!S.ac || S.mute) return null;
  const fn = INST[inst as InstName] || INST.piano;
  // pad 吃和弦数组，其它乐器吃单音；两种签名在这里合流
  return fn(midi as number, t || now(), opt || {}) || null;
}

/* ---------------- 搞怪音效 ---------------- */
// 全部为程序化合成：这类音效要的是"性格"而不是真实度，
// 也省掉了为每个梗音单独找素材的成本。

function sfx(name: SfxName | string, t: number, opt?: SfxOpt): void {
  if (!S.ac || S.mute) return;
  const c = S.ac;
  const o = opt || {};
  const v = o.gain == null ? 1 : o.gain;
  const pitch = o.pitch || 1;
  const pan = panner(o.pan || 0);
  const out = mk('gain');
  out.gain.value = v;
  if (pan) { out.connect(pan); pan.connect(busOf('fx')); } else out.connect(busOf('fx'));

  const sendNoise = (dur: number, hp: number, gain: number): void => {
    const n = c.createBufferSource(); n.buffer = S.noise;
    const f = mk('filter', { type: 'highpass', frequency: hp });
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(out);
    n.start(t, Math.random() * 0.4); n.stop(t + dur + 0.02);
  };

  switch (name) {
    case 'wood': { // 木鱼
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(430 * pitch, t);
      osc.frequency.exponentialRampToValueAtTime(300 * pitch, t + 0.05);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.55, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      osc.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + 0.13);
      sendNoise(0.03, 2600, 0.16);
      break;
    }
    case 'bubble': { // 泡泡
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(240 * pitch, t);
      osc.frequency.exponentialRampToValueAtTime(1150 * pitch, t + 0.06);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      osc.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + 0.15);
      break;
    }
    case 'boing': { // 弹簧
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = 'sine';
      const f0 = 150 * pitch;
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f0 * 3.1, t + 0.13);
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.setValueAtTime(24, t);
      lfo.frequency.linearRampToValueAtTime(9, t + 0.3);
      lg.gain.value = f0 * 0.16;
      lfo.connect(lg); lg.connect(osc.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.45, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      osc.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + 0.36);
      lfo.start(t); lfo.stop(t + 0.36);
      break;
    }
    case 'meow': { // 喵
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = 'sawtooth';
      const f0 = 480 * pitch;
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.linearRampToValueAtTime(f0 * 0.74, t + 0.16);
      osc.frequency.linearRampToValueAtTime(f0 * 1.28, t + 0.4);
      const bp1 = mk('filter', { type: 'bandpass', frequency: 850, Q: 5 });
      const bp2 = mk('filter', { type: 'bandpass', frequency: 2300, Q: 7 });
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.05);
      g.gain.linearRampToValueAtTime(0.35, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
      osc.connect(bp1); osc.connect(bp2);
      bp1.connect(g); bp2.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + 0.5);
      break;
    }
    case 'duck': { // 鸭
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = 'square';
      const f0 = 330 * pitch;
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.68, t + 0.16);
      const am = c.createOscillator(), amG = c.createGain();
      am.type = 'square'; am.frequency.value = 34;
      amG.gain.value = 0.28;
      am.connect(amG); amG.connect(g.gain);
      const bp = mk('filter', { type: 'bandpass', frequency: 1250, Q: 2.4 });
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.34, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(bp); bp.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + 0.22);
      am.start(t); am.stop(t + 0.22);
      break;
    }
    case 'type': { // 打字机
      sendNoise(0.026, 2400, 0.5);
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = 'square';
      osc.frequency.value = 1500 * pitch;
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      osc.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + 0.06);
      break;
    }
    case 'laser': { // 激光
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1700 * pitch, t);
      osc.frequency.exponentialRampToValueAtTime(190 * pitch, t + 0.15);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.34, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + 0.2);
      break;
    }
    case 'buzz': { // 抢拍的低鸣
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(96, t);
      osc.frequency.linearRampToValueAtTime(72, t + 0.16);
      const lp = mk('filter', { type: 'lowpass', frequency: 520, Q: 2 });
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.30, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(lp); lp.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + 0.2);
      break;
    }
    case 'clap': { // 拍手
      [0, 0.011, 0.023].forEach((d, i) => {
        const n = c.createBufferSource(); n.buffer = S.noise;
        const bp = mk('filter', { type: 'bandpass', frequency: 1400 + i * 260, Q: 1.3 });
        const g = c.createGain();
        g.gain.setValueAtTime(0.34 - i * 0.06, t + d);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.12);
        n.connect(bp); bp.connect(g); g.connect(out);
        n.start(t + d, Math.random() * 0.5); n.stop(t + d + 0.14);
      });
      break;
    }
    default: {
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 880 * pitch;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + 0.14);
    }
  }
}

/* ---------------- 预备拍 / 侧链 ---------------- */

function click(t: number, accent?: boolean): void {
  if (!S.ac || S.mute) return;
  const c = S.ac;
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = accent ? 1780 : 1320;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(accent ? 0.22 : 0.13, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  osc.connect(g); g.connect(busOf('fx'));
  osc.start(t); osc.stop(t + 0.08);
  // 一点点击质感
  const n = c.createBufferSource(); n.buffer = S.noise;
  const hp = mk('filter', { type: 'highpass', frequency: 3000 });
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.10, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
  n.connect(hp); hp.connect(ng); ng.connect(busOf('fx'));
  n.start(t); n.stop(t + 0.03);
}

// 伪侧链：底鼓落下时把和声与贝斯压一下，电子乐"呼吸"的来源
function duck(t: number, amount?: number): void {
  if (!S.ac) return;
  const a = amount == null ? 0.34 : amount;
  if (a <= 0) return;
  S.duckTargets.forEach((d) => {
    // 用固定基准值，不能读 .value（半途读会把总线越压越低）
    d.g.gain.cancelScheduledValues(t);
    d.g.gain.setValueAtTime(d.base, t);
    d.g.gain.linearRampToValueAtTime(d.base * (1 - a), t + 0.025);
    d.g.gain.linearRampToValueAtTime(d.base, t + 0.26);
  });
}

/* ---------------- 对外 ---------------- */

// 调试用：从输出端取电平，用来校准各总线音量（不影响发声）
let tapNode: AnalyserNode | null = null;
function level(): Level | null {
  if (!S.ac || !S.out) return null;
  if (!tapNode) {
    tapNode = S.ac.createAnalyser();
    tapNode.fftSize = 2048;
    S.out.connect(tapNode);
  }
  const d = new Float32Array(tapNode.fftSize);
  tapNode.getFloatTimeDomainData(d);
  let sum = 0, peak = 0;
  for (let i = 0; i < d.length; i++) {
    sum += d[i] * d[i];
    const a = Math.abs(d[i]);
    if (a > peak) peak = a;
  }
  return { rms: Math.sqrt(sum / d.length), peak };
}

export interface SfxApi {
  init(): boolean;
  ensure(): Promise<boolean>;
  now(): number;
  setMute(m: boolean): void;
  setSpace(name: string): void;
  setKit(name: string): void;
  drum(name: DrumName, t: number, opt?: DrumOpt): void;
  note(inst: InstName | string, midi: number | number[], t?: number, opt?: NoteOpt): Voice | null;
  sfx(name: SfxName | string, t: number, opt?: SfxOpt): void;
  click(t: number, accent?: boolean): void;
  duck(t: number, amount?: number): void;
  level(): Level | null;
  readonly ready: boolean;
  readonly loaded: boolean;
  readonly ctx: AudioContext | null;
  readonly assets: string[];
}

export const SFX: SfxApi = {
  init: boot, ensure, now, setMute,
  setSpace, setKit,
  drum, note, sfx, click, duck, level,
  get ready() { return !!S.ac; },
  get loaded() { return S.loaded; },
  get ctx() { return S.ac; },
  get assets() { return Object.keys(S.bufs); },
};
