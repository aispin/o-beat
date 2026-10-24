/* 音色层：一个 voice() 入口，按名字分派到采样或合成。
   采样缺席时退到最接近的合成音色 —— 资源 403 也不至于整首没声。 */
import type { Bus, PlayOpt, VoiceName } from './types';
import { pickSample } from './samples';

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** 接到总线，顺便做声像与混响送出。
    rev 是"送出量"不是"湿度"：干声永远按原样进 master，额外复制一份给混响。 */
export function out(bus: Bus, node: AudioNode, pan?: number, rev?: number): void {
  let tail: AudioNode = node;
  if (pan && bus.ctx.createStereoPanner) {
    const p = bus.ctx.createStereoPanner();
    p.pan.value = pan;
    tail.connect(p);
    tail = p;
  }
  tail.connect(bus.master);
  if (rev && rev > 0 && bus.rev) {
    const g = bus.ctx.createGain();
    g.gain.value = rev;
    tail.connect(g);
    g.connect(bus.rev);
  }
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
  out(bus, g, pan, o.rev);

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

/** 软贝斯：lofi 的低音。
    ------------------------------------------------------------
    和 `ebass`（采样电贝斯）的区别不在音高，在**起音与收尾**：
    采样贝斯是 2 ms 的拨弦瞬态 + 很快的衰减，密集排布就是"一顿一顿"。
    这里要的是"手指按下去、弦自己慢慢松"：

    - 14 ms 起音（比采样慢一个数量级），没有拨片的"啪"；
    - 低通从 1250 Hz 收到 620 Hz：起头有一点指肉的亮，之后只剩厚度；
    - 包络三段（100% → 66% → 34%），不是"响一下然后断"；
    - 一点点 tanh 饱和，模拟磁带/音箱的软压缩。
    音高不抖 —— 低频抖起来是"跑调"，不是"复古"。 */
function bassLofi(
  bus: Bus,
  freq: number,
  t: number,
  dur: number,
  gain: number,
  pan?: number,
  rev?: number,
): void {
  const c = bus.ctx;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.1;
  lp.frequency.setValueAtTime(1250, t);
  lp.frequency.exponentialRampToValueAtTime(620, t + 0.22);

  const sh = c.createWaveShaper();
  sh.curve = driveCurve(0.05);
  sh.oversample = '2x';

  const g = c.createGain();
  const a = 0.014;
  const d1 = t + 0.30;
  const d2 = Math.max(d1 + 0.06, t + dur * 0.86);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.66), d1);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.34), d2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);

  lp.connect(sh);
  sh.connect(g);
  out(bus, g, pan, rev);

  // 正弦是"听见的音高"，三角是"手指的触感"，二次谐波给一点定位感
  const spec: [OscillatorType, number, number][] = [
    ['sine', 1, 1],
    ['triangle', 1, 0.28],
    ['sine', 2, 0.09],
  ];
  spec.forEach(([type, mul, amt]) => {
    const o = c.createOscillator();
    o.type = type;
    // 起音时高 1.2%，45 ms 落回：弦被按下去的那一下
    o.frequency.setValueAtTime(freq * mul * 1.012, t);
    o.frequency.exponentialRampToValueAtTime(freq * mul, t + 0.045);
    const og = c.createGain();
    og.gain.value = amt;
    o.connect(og);
    og.connect(lp);
    o.start(t);
    o.stop(t + dur + 0.08);
  });
}

/** 梦幻铺底：一支 pad 就是"一片空气"，不是一个和弦。
    ------------------------------------------------------------
    四个决定叠出"梦幻"：

    1. **失谐**。同一音高叠 3 支三角波，分别 −9 / +4 / +11 音分。
       它们之间的拍频是 0.2–0.8 Hz —— 比颤音慢得多，人耳听不出"在抖"，
       只听到"在动"。合唱效果的本质就是这个。
    2. **慢开慢收**。起音 0.5–1.1 s，收尾 0.7–2.2 s，和弦之间互相搭住，
       永远没有一个"从零开始"的瞬间。
    3. **只往上开的低通**。820 → 2100 Hz，跟起音同步。
       垫的亮度如果在尾巴上回落，就会变成"呼——"的呼吸声，太像风。
    4. **高八度微光**。一支很轻的正弦（0.15）叠在上面，偏左或偏右，
       和主体错开 —— 梦幻感大半来自这条"听不清但一直在"的泛音。
    */
function softPad(
  bus: Bus,
  freq: number,
  t: number,
  dur: number,
  gain: number,
  pan?: number,
  rev?: number,
): void {
  const c = bus.ctx;
  const base = pan || 0;

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.4;
  lp.frequency.setValueAtTime(820, t);
  lp.frequency.linearRampToValueAtTime(2100, t + Math.min(2.6, Math.max(0.6, dur * 0.75)));

  const amp = c.createGain();
  const atk = Math.min(1.1, Math.max(0.5, dur * 0.22));
  const rel = Math.min(2.2, Math.max(0.7, dur * 0.35));
  const hold = Math.max(atk + 0.05, dur - rel);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t + atk);
  amp.gain.setValueAtTime(Math.max(0.0002, gain), t + hold);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  lp.connect(amp);
  out(bus, amp, 0, rev);

  // 全体音高一起极慢地漂 ±7 音分：磁带转速不稳，但比手抖还慢
  const lfo = c.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.19 + Math.random() * 0.08;
  const lg = c.createGain();
  lg.gain.value = 7;
  lfo.connect(lg);
  lfo.start(t);
  lfo.stop(t + dur + 0.1);

  const spec: [number, number, number, OscillatorType, number][] = [
    // 八度倍率, 音分, 声像, 波形, 相对音量
    [1, -9, -0.62, 'triangle', 1],
    [1, 4, 0.02, 'triangle', 0.86],
    [1, 11, 0.62, 'sawtooth', 0.34],
    [2, 3, 0.34, 'sine', 0.15],
  ];
  spec.forEach(([mul, cents, p, type, amt]) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq * mul;
    o.detune.value = cents;
    lg.connect(o.detune);

    const og = c.createGain();
    og.gain.value = amt;
    o.connect(og);
    if (c.createStereoPanner) {
      const pn = c.createStereoPanner();
      pn.pan.value = Math.max(-1, Math.min(1, base + p));
      og.connect(pn);
      pn.connect(lp);
    } else {
      og.connect(lp);
    }
    o.start(t);
    o.stop(t + dur + 0.12);
  });
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
    case 'pad':
      softPad(bus, mtof(midi), t, dur, gain, pan, opt && opt.rev);
      return;
    case 'bassLofi':
      bassLofi(bus, mtof(midi), t, dur, gain, pan, opt && opt.rev);
      return;
    case 'sub':
      subBass(bus, mtof(midi), t, dur, gain);
      return;
    case 'softPiano': {
      /* 软钢琴 = 钢琴采样 + 三道处理，每一道都是为了"去掉琴键的锋利"：
         1. 低通 2100 Hz：钢琴的槌击噪声在 3–6 kHz，砍掉才是"软"。
         2. 14 ms 起音：真钢琴是 5 ms，但 lofi 要"闷进去"，不是"弹出来"。
         3. 7 音分失谐的第二层（弱 34%、晚 14 ms）：拍频 = 磁带走带不稳。
         最后一点点饱和，让录音机的磁头过载感出来。 */
      const lp = (opt && opt.lp) || 2600;
      const rev = opt && opt.rev != null ? opt.rev : 0.14;
      if (playSample(bus, 'piano', midi, t, dur, gain, pan, { lp, attack: 0.014, drive: 0.05, rev })) {
        playSample(bus, 'piano', midi, t + 0.014, dur, gain * 0.34, pan, {
          lp: lp * 0.82,
          detune: 0.0042,
          attack: 0.02,
          rev,
        });
        return;
      }
      tone(bus, 'triangle', mtof(midi), t, dur, gain * 0.8, pan);
      return;
    }
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
