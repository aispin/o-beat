/* lofi 套鼓：不用采样，纯合成。
   ------------------------------------------------------------
   为什么不用采样：鼓采样（acoustic / kpr77）的军鼓是 2ms 垂直起音、
   6kHz 以上完整保留，听起来是摇滚的。lofi 要的正好相反 —— 起音软、
   高频收、每次击打都不太一样。这些全靠参数，采样反而不好改。

   三件套的声学依据：
   - 军鼓 = 两层鼓皮模态（1 : 1.58，两个圆膜的比值）+ 三段响弦噪声
     （低/中/高各自衰减），只给一层噪声会变成"白噪声刷一下"。
   - 底鼓 = 正弦快速扫频 + 12ms 的低通噪声敲门声，扫频后段再降 4%
     才有"鼓皮松弛"的感觉。
   - 踩镲 = 两层粉噪（短促的"嗒" + 低电平余响），粉噪比白噪更接近
     镲片，白噪太亮。

   两套预设（明亮 / 更暗）二选一，由 reroll() 每首曲子掷一次。
   两套只改音色不改电平 —— 免得同一首里军鼓忽大忽小。
   电平按"同 v 与采样鼓等响"标定（比值来自 docs/research/lofi-lab 的 A/B）。
*/

export type LofiHit = 'kick' | 'snare' | 'hat' | 'openhat' | 'tom';

/** 响弦的一层噪声：中心频率 / Q / 峰值 / 衰减 / 高通 */
interface Layer {
  bp: number;
  q: number;
  amt: number;
  decay: number;
  hp: number;
}

interface Kit {
  kick: {
    f0: number; f1: number; sweep: number; decay: number; attack: number;
    click: number; clickLp: number; drive: number; lp: number; amp: number;
  };
  snare: {
    body: number; bodyAmt: number; toneDecay: number; attack: number;
    layers: Layer[]; drive: number; lp: number; hp: number; amp: number;
  };
  hat: { layers: Layer[]; hp: number; lp: number; amp: number };
  open: { layers: Layer[]; hp: number; lp: number; amp: number };
}

/* amp 是"与同一 v 的采样鼓等响"的系数，不是随手写的增益 */
const BRIGHT: Kit = {
  kick: {
    f0: 108, f1: 45, sweep: 0.09, decay: 0.38, attack: 0.004,
    click: 0.09, clickLp: 1500, drive: 1.5, lp: 5000, amp: 1.105,
  },
  snare: {
    body: 186, bodyAmt: 0.40, toneDecay: 0.19, attack: 0.004,
    layers: [
      { bp: 900, q: 1.0, amt: 0.16, decay: 0.25, hp: 320 },
      { bp: 2600, q: 0.7, amt: 0.20, decay: 0.23, hp: 900 },
      { bp: 7200, q: 0.6, amt: 0.10, decay: 0.075, hp: 4200 },
    ],
    drive: 1.7, lp: 7000, hp: 95, amp: 1.056,
  },
  hat: {
    layers: [
      { bp: 7800, q: 0.7, amt: 0.9, decay: 0.062, hp: 4800 },
      { bp: 6200, q: 0.9, amt: 0.40, decay: 0.26, hp: 4800 },
      { bp: 3400, q: 0.8, amt: 0.13, decay: 0.045, hp: 2400 },
    ],
    hp: 2700, lp: 11500, amp: 2.43,
  },
  open: {
    layers: [
      { bp: 7600, q: 0.6, amt: 0.8, decay: 0.16, hp: 4600 },
      { bp: 6000, q: 0.8, amt: 0.3, decay: 0.34, hp: 4600 },
      { bp: 3400, q: 0.7, amt: 0.12, decay: 0.14, hp: 2400 },
    ],
    hp: 2700, lp: 11000, amp: 2.92,
  },
};

/* 更暗更糯：鼓皮降 3 个半音、尾巴长三成、低通再收一档 */
const TAPE: Kit = {
  kick: {
    f0: 104, f1: 43, sweep: 0.10, decay: 0.41, attack: 0.005,
    click: 0.075, clickLp: 1300, drive: 1.65, lp: 4300, amp: 1.105,
  },
  snare: {
    body: 165, bodyAmt: 0.44, toneDecay: 0.24, attack: 0.008,
    layers: [
      { bp: 850, q: 1.0, amt: 0.15, decay: 0.30, hp: 300 },
      { bp: 2400, q: 0.65, amt: 0.18, decay: 0.28, hp: 850 },
      { bp: 6700, q: 0.6, amt: 0.08, decay: 0.10, hp: 4000 },
    ],
    drive: 1.55, lp: 5800, hp: 90, amp: 1.056,
  },
  hat: {
    layers: [
      { bp: 7400, q: 0.7, amt: 0.9, decay: 0.066, hp: 4600 },
      { bp: 5800, q: 0.9, amt: 0.42, decay: 0.30, hp: 4600 },
      { bp: 3300, q: 0.8, amt: 0.12, decay: 0.048, hp: 2300 },
    ],
    hp: 2600, lp: 9800, amp: 2.43,
  },
  open: {
    layers: [
      { bp: 7400, q: 0.6, amt: 0.8, decay: 0.18, hp: 4400 },
      { bp: 5700, q: 0.8, amt: 0.32, decay: 0.38, hp: 4400 },
      { bp: 3300, q: 0.7, amt: 0.11, decay: 0.15, hp: 2300 },
    ],
    hp: 2600, lp: 9600, amp: 2.92,
  },
};

/** 两套预设里选中的一套。每首曲子掷一次，见 reroll() */
let dark = Math.random() < 0.5;

/** 换曲 / 换鼓组时重新掷一次。同一首里不改，免得军鼓忽高忽低 */
export function reroll(): void {
  dark = Math.random() < 0.5;
}

/* ---------------- 噪声与曲线（按 AudioContext 缓存） ---------------- */

interface Noise { white?: AudioBuffer; pink?: AudioBuffer }
const NOISE = new WeakMap<BaseAudioContext, Noise>();
const CURVES = new Map<number, Float32Array<ArrayBuffer>>();

function noise(ctx: BaseAudioContext, kind: 'white' | 'pink'): AudioBuffer {
  let bag = NOISE.get(ctx);
  if (!bag) { bag = {}; NOISE.set(ctx, bag); }
  const hit = bag[kind];
  if (hit) return hit;

  const dur = kind === 'pink' ? 2.2 : 1.0;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);

  if (kind === 'white') {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else {
    // Paul Kellet 的粉噪滤波器：低频更厚，镲片不像白噪那样刺
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  bag[kind] = buf;
  return buf;
}

function curve(drive: number): Float32Array<ArrayBuffer> {
  const hit = CURVES.get(drive);
  if (hit) return hit;
  const n = 2048;
  const c = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * drive) / norm;
  }
  CURVES.set(drive, c);
  return c;
}

/* ---------------- 小工具 ---------------- */

function gainOf(ctx: BaseAudioContext, v = 1): GainNode {
  const n = ctx.createGain();
  n.gain.value = v;
  return n;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const n = ctx.createBiquadFilter();
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  return n;
}

function sat(ctx: BaseAudioContext, drive: number): WaveShaperNode {
  const w = ctx.createWaveShaper();
  w.curve = curve(drive);
  w.oversample = '2x';
  return w;
}

/** 起音 → 指数衰减。没有保持段 —— 打击乐本来就不该有 */
function snap(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** 收尾：可选的声像 + 接到目标节点 */
function finish(ctx: BaseAudioContext, node: AudioNode, dest: AudioNode, pan: number): void {
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p);
    p.connect(dest);
    return;
  }
  node.connect(dest);
}

/* ---------------- 三件套 ---------------- */

function kick(ctx: BaseAudioContext, kit: Kit, dest: AudioNode, t: number, v: number, pan: number): void {
  const p = kit.kick;
  const out = gainOf(ctx, p.amp * v);
  const sh = sat(ctx, p.drive);
  const lp = filter(ctx, 'lowpass', p.lp, 0.7);
  out.connect(sh); sh.connect(lp);
  finish(ctx, lp, dest, pan);

  // 鼓皮：扫频到底之后再降 4%，松弛感来自这里
  const o = ctx.createOscillator();
  o.type = 'sine';
  const jitter = 1 + (Math.random() * 2 - 1) * 0.015;
  o.frequency.setValueAtTime(p.f0 * jitter, t);
  o.frequency.exponentialRampToValueAtTime(p.f1, t + p.sweep);
  o.frequency.exponentialRampToValueAtTime(p.f1 * 0.96, t + p.decay);
  const e = gainOf(ctx, 0.0001);
  e.gain.setValueAtTime(0.0001, t);
  e.gain.exponentialRampToValueAtTime(1, t + p.attack);
  e.gain.exponentialRampToValueAtTime(0.0001, t + p.attack + p.decay);
  o.connect(e); e.connect(out);
  o.start(t); o.stop(t + p.decay + 0.06);

  // 敲门声：12ms 的低通噪声，让它在小喇叭上也能听出来
  const n = ctx.createBufferSource();
  n.buffer = noise(ctx, 'white');
  const cl = filter(ctx, 'lowpass', p.clickLp, 0.8);
  const cg = gainOf(ctx, 1);
  cg.gain.setValueAtTime(p.click, t);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
  n.connect(cl); cl.connect(cg); cg.connect(out);
  n.start(t, Math.random() * 0.3); n.stop(t + 0.02);
}

function snare(ctx: BaseAudioContext, kit: Kit, dest: AudioNode, t: number, v: number, pan: number, body = 1): void {
  const p = kit.snare;
  const out = gainOf(ctx, p.amp * v);
  const sh = sat(ctx, p.drive);
  const lp = filter(ctx, 'lowpass', p.lp, 0.7);
  const hp = filter(ctx, 'highpass', p.hp, 0.7);
  out.connect(sh); sh.connect(lp); lp.connect(hp);
  finish(ctx, hp, dest, pan);

  // 鼓皮：两个模态叠加，高模态衰减更快
  const modes: [number, number][] = [[1, 1], [1.58, 0.45]];
  modes.forEach(([ratio, amt]) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = p.body * body * ratio;
    o.frequency.setValueAtTime(f * 1.14, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.035);
    o.frequency.exponentialRampToValueAtTime(f * 0.982, t + p.attack + p.toneDecay);
    const g = gainOf(ctx, 1);
    snap(g, t, p.bodyAmt * amt, p.attack, p.toneDecay * (ratio > 1.2 ? 0.55 : 1));
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + p.attack + p.toneDecay + 0.06);
  });

  // 响弦：低 / 中 / 高分开衰减，合成一个"沙"字
  p.layers.forEach((L) => {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx, 'pink');
    const bp = filter(ctx, 'bandpass', L.bp, L.q);
    const lhp = filter(ctx, 'highpass', L.hp, 0.7);
    const g = gainOf(ctx, 1);
    const at = p.attack;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(L.amt, t + at);
    g.gain.exponentialRampToValueAtTime(L.amt * 0.34, t + at + 0.055);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + L.decay);
    src.connect(bp); bp.connect(lhp); lhp.connect(g); g.connect(out);
    src.start(t, Math.random() * 0.4); src.stop(t + at + L.decay + 0.06);
  });
}

function hat(ctx: BaseAudioContext, kit: Kit, dest: AudioNode, t: number, v: number, pan: number, open: boolean): void {
  const p = open ? kit.open : kit.hat;
  const out = gainOf(ctx, p.amp * v);
  const hp = filter(ctx, 'highpass', p.hp, 0.7);
  const lp = filter(ctx, 'lowpass', p.lp, 0.7);
  out.connect(hp); hp.connect(lp);
  finish(ctx, lp, dest, pan);

  p.layers.forEach((L) => {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx, 'pink');
    const bp = filter(ctx, 'bandpass', L.bp, L.q);
    const g = gainOf(ctx, 1);
    const at = 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(L.amt, t + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + L.decay);
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(t, Math.random() * 0.4); src.stop(t + at + L.decay + 0.08);
  });
}

export interface LofiOpt {
  /** 强制指定预设；不给就用 reroll() 掷出来的那套 */
  dark?: boolean;
  pan?: number;
}

/** 敲一下。v 与采样鼓同一个尺度：v=1 时两套等响 */
export function lofiHit(
  ctx: BaseAudioContext,
  dest: AudioNode,
  hit: LofiHit,
  t: number,
  v: number,
  opt?: LofiOpt,
): void {
  if (!(v > 0)) return;
  const kit = (opt && opt.dark != null ? opt.dark : dark) ? TAPE : BRIGHT;
  const pan = (opt && opt.pan) || 0;

  if (hit === 'kick') { kick(ctx, kit, dest, t, v, pan); return; }
  if (hit === 'snare') { snare(ctx, kit, dest, t, v, pan); return; }
  // 通鼓借军鼓的壳，鼓皮更低、尾巴更长
  if (hit === 'tom') { snare(ctx, kit, dest, t, v * 0.9, pan, 0.72); return; }
  hat(ctx, kit, dest, t, v, pan, hit === 'openhat');
}
