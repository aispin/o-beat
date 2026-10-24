/* 音色层：一个 voice() 入口，按名字分派到采样或合成。
   采样缺席时退到最接近的合成音色 —— 资源 403 也不至于整首没声。 */
import type { Bus, PlayOpt, VoiceName } from './types';
import { pickSample } from './samples';

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** 接到总线，顺便做声像 */
export function out(bus: Bus, node: AudioNode, pan?: number): void {
  if (pan && bus.ctx.createStereoPanner) {
    const p = bus.ctx.createStereoPanner();
    p.pan.value = pan;
    node.connect(p);
    p.connect(bus.master);
    return;
  }
  node.connect(bus.master);
}

/* 失真曲线：软削波。硬方波会立刻回到 8bit 味，tanh 才是过载的感觉。 */
const CURVES: Record<number, Float32Array<ArrayBuffer>> = {};

function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const k = 1 + amount * 24;
  const cached = CURVES[k];
  if (cached) return cached;
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * k) / Math.tanh(k);
  }
  CURVES[k] = curve;
  return curve;
}

/** 采样发声。
    包络只做三件事：短起音防爆音、保持、末尾短释放防截断。
    **不能**在这里再做指数衰减 —— 采样自带 ADSR，叠加一层就等于
    一发声就开始掉电平，整段又轻又碎。 */
export function playSample(
  bus: Bus,
  name: string,
  midi: number,
  t: number,
  dur: number,
  gain: number,
  pan?: number,
  opt?: PlayOpt,
): boolean {
  const hit = pickSample(bus, name, midi);
  if (!hit) return false;

  const c = bus.ctx;
  const o = opt || {};
  const src = c.createBufferSource();
  src.buffer = hit.buf;
  src.playbackRate.value = hit.rate * (o.detune ? 1 + o.detune : 1);

  let tail: AudioNode = src;
  if (o.lp) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    f.Q.value = 0.6;
    tail.connect(f);
    tail = f;
  }
  if (o.drive) {
    const w = c.createWaveShaper();
    w.curve = driveCurve(o.drive);
    w.oversample = '2x';
    tail.connect(w);
    tail = w;
  }

  const g = c.createGain();
  const atk = o.attack == null ? 0.004 : o.attack;
  const rel = Math.min(0.09, dur * 0.35);
  const hold = Math.max(atk + 0.002, dur - rel);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + atk);
  g.gain.setValueAtTime(gain, t + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(hold + 0.01, dur));
  tail.connect(g);
  out(bus, g, pan);

  src.start(t);
  // 采样比 dur 短时提前收尾，避免读到 buffer 之外的空洞
  const end = Math.min(dur, hit.buf.duration / hit.rate) + 0.05;
  src.stop(t + end);
  return true;
}

/** 基础振荡器音。芯片音色用它。 */
export function tone(
  bus: Bus,
  type: OscillatorType,
  freq: number,
  t: number,
  dur: number,
  gain: number,
  pan?: number,
): void {
  const c = bus.ctx;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;

  const g = c.createGain();
  const atk = 0.004;
  const rel = Math.min(0.04, dur * 0.3);
  const hold = Math.max(atk + 0.002, dur - rel);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + atk);
  g.gain.setValueAtTime(gain, t + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(hold + 0.01, dur));

  o.connect(g);
  out(bus, g, pan);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** FM 钟：载波 + 调制器，调制指数快速衰减。
    敲击瞬间亮、尾巴干净 —— 80 年代电钢/钟声的经典做法。 */
function fmBell(bus: Bus, freq: number, t: number, dur: number, gain: number, pan?: number): void {
  const c = bus.ctx;
  const car = c.createOscillator();
  const mod = c.createOscillator();
  const modGain = c.createGain();
  car.type = 'sine';
  mod.type = 'sine';
  car.frequency.value = freq;
  mod.frequency.value = freq * 3.01; // 非整数比，声音不"木"
  modGain.gain.setValueAtTime(freq * 2.2, t);
  modGain.gain.exponentialRampToValueAtTime(freq * 0.16, t + 0.4);
  mod.connect(modGain);
  modGain.connect(car.frequency);

  const g = c.createGain();
  const atk = 0.006;
  const rel = Math.min(0.12, dur * 0.4);
  const hold = Math.max(atk + 0.004, dur - rel);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + atk);
  g.gain.setValueAtTime(gain, t + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(hold + 0.01, dur));
  car.connect(g);
  out(bus, g, pan);

  car.start(t);
  mod.start(t);
  car.stop(t + dur + 0.03);
  mod.stop(t + dur + 0.03);
}

/** 拨弦：锯齿过一条快速下坠的低通。电子乐最常用的 pluck。 */
function pluck(bus: Bus, freq: number, t: number, dur: number, gain: number, pan?: number): void {
  const c = bus.ctx;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = freq;

  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 6;
  f.frequency.setValueAtTime(Math.min(12000, freq * 9), t);
  f.frequency.exponentialRampToValueAtTime(Math.max(700, freq * 3.4), t + 0.28);

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  o.connect(f);
  f.connect(g);
  out(bus, g, pan);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** 超锯齿垫：三个微失谐的锯齿 + 慢起音。电子乐的"宽带"。 */
function supersaw(
  bus: Bus,
  freq: number,
  t: number,
  dur: number,
  gain: number,
  pan?: number,
): void {
  const c = bus.ctx;
  const g = c.createGain();
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = Math.min(9000, Math.max(2400, freq * 11));
  f.Q.value = 0.7;

  const atk = Math.min(0.6, dur * 0.22);
  const rel = Math.min(0.5, dur * 0.3);
  const hold = Math.max(atk + 0.01, dur - rel);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + atk);
  g.gain.setValueAtTime(gain, t + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(hold + 0.01, dur));

  [-7, 0, 7].forEach((cents, i) => {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    o.detune.value = cents;
    const og = c.createGain();
    og.gain.value = i === 1 ? 0.5 : 0.32;
    o.connect(og);
    og.connect(f);
    o.start(t);
    o.stop(t + dur + 0.03);
  });

  f.connect(g);
  out(bus, g, pan);
}

/** sub 低音：正弦 + 一点二倍频三角，撑住低频但不糊 */
function subBass(bus: Bus, freq: number, t: number, dur: number, gain: number): void {
  const c = bus.ctx;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.value = freq;

  const o2 = c.createOscillator();
  o2.type = 'triangle';
  o2.frequency.value = freq * 2;
  const g2 = c.createGain();
  g2.gain.value = 0.18;

  const g = c.createGain();
  const hold = Math.max(0.02, dur - 0.06);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.setValueAtTime(gain, t + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  o.connect(g);
  o2.connect(g2);
  g2.connect(g);
  out(bus, g, 0);
  o.start(t);
  o2.start(t);
  o.stop(t + dur + 0.02);
  o2.stop(t + dur + 0.02);
}

/** 噪声瞬态：军鼓的沙沙、踩镲的嗒、黑胶的噼啪都从这来 */
export function noiseHit(
  bus: Bus,
  t: number,
  dur: number,
  gain: number,
  type: BiquadFilterType,
  freq: number,
  q?: number,
): void {
  if (!(gain > 0)) return;
  const c = bus.ctx;
  const n = c.createBufferSource();
  n.buffer = bus.noise;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  if (q) f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f);
  f.connect(g);
  out(bus, g, 0);
  n.start(t, Math.random() * 0.2);
  n.stop(t + dur + 0.02);
}

/** 统一入口：名字 → 采样 / 合成 */
export function voice(
  bus: Bus,
  name: VoiceName,
  midi: number,
  t: number,
  dur: number,
  gain: number,
  pan?: number,
  opt?: PlayOpt,
): void {
  switch (name) {
    case 'chipLead':
      tone(bus, 'square', mtof(midi), t, dur, gain, pan);
      return;
    case 'chipBass':
      tone(bus, 'triangle', mtof(midi), t, dur, gain, pan);
      return;
    case 'bell':
      fmBell(bus, mtof(midi), t, dur, gain, pan);
      return;
    case 'pluck':
      pluck(bus, mtof(midi), t, dur, gain, pan);
      return;
    case 'saw':
      supersaw(bus, mtof(midi), t, dur, gain, pan);
      return;
    case 'sub':
      subBass(bus, mtof(midi), t, dur, gain);
      return;
    case 'epiano': {
      // 电钢 = 钢琴采样压掉高频 + 一层微失谐叠层。
      // 直接放钢琴太"亮"，电子和 lofi 需要更钝的琴。
      const lp = (opt && opt.lp) || 2600;
      if (playSample(bus, 'piano', midi, t, dur, gain, pan, { lp })) {
        playSample(bus, 'piano', midi, t + 0.012, dur, gain * 0.42, pan, { lp });
        return;
      }
      fmBell(bus, mtof(midi), t, dur, gain * 0.9, pan);
      return;
    }
    case 'egt': {
      // 失真电吉他：采样过软削波，再过箱体低通
      const drive = opt && opt.drive != null ? opt.drive : 0.55;
      const lp = (opt && opt.lp) || 3600;
      if (playSample(bus, 'egt', midi, t, dur, gain, pan, { drive, lp })) return;
      tone(bus, 'sawtooth', mtof(midi), t, dur, gain * 0.8, pan);
      return;
    }
    default:
      if (playSample(bus, name, midi, t, dur, gain, pan, opt)) return;
      // 采样没到（首次加载中）也要有声音，哪怕音色不对
      tone(bus, 'triangle', mtof(midi), t, dur, gain * 0.85, pan);
  }
}
