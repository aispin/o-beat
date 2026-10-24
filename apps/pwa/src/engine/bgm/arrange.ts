/* 排程：把一行的编曲摊到时间轴上。
   三种层各一个函数，都从「小节开始」的绝对时间 t 出发，
   内部按自己的节奏型算偏移 —— 比逐格判断简单，也省一半分支。 */
import type { Bus, Chord, Score } from './types';
import { noiseHit, voice } from './voices';
import { drumSample, kick } from './drums';

/** 低音的节奏型。数值是「第几个十六分位 → 相对根音的半音」 */
const BASS_PATTERN: Record<string, [number, number][]> = {
  // 每拍一个根音，第三拍换五度
  quarter: [[0, 0], [4, 0], [8, 7], [12, 0]],
  // 八分音符：根音 / 五度 / 高八度
  eighth: [[0, 0], [2, 0], [4, 7], [6, 0], [8, 0], [10, 7], [12, 0], [14, 12]],
  // 三拍子：一小节就一个长音，让弓弦自己衰减
  waltz: [[0, 0]],
  // 半音符，lofi 的慵懒底
  half: [[0, 0], [8, 0]],
  // 根音 + 五度交替，民谣的交替低音
  root5: [[0, 0], [4, 7], [8, 0], [12, 7]],
  // 摇滚：八分音符同音反复，靠失真起节奏
  riff: [[0, 0], [2, 0], [4, 0], [6, 0], [8, 0], [10, 0], [12, 0], [14, 0]],
};

export function scheduleBass(bus: Bus, sc: Score, chord: Chord, t: number, sw = 0): void {
  const b = sc.bass;
  const pat = BASS_PATTERN[b.type] || BASS_PATTERN.quarter;
  // sub 是持续低频，给得比拨弦长；waltz 本来就是一小节一个长音
  const len = b.type === 'waltz' ? sc.step * 10 : b.inst === 'sub' ? sc.step * 6 : sc.step * 1.8;
  const g = b.gain * sc.mix.bass;

  pat.forEach(([s, semi]) => {
    if (s >= sc.steps) return;
    const midi = chord.root + semi + (b.oct || 0);
    const at = t + s * sc.step + (s % 2 ? sw : 0);
    if (b.inst === 'sub') voice(bus, 'sub', midi, at, len, g, 0);
    else voice(bus, b.inst, midi, at, len, g, 0, { lp: 3000 });
  });
}

export function scheduleComp(bus: Bus, sc: Score, chord: Chord, t: number, sw = 0): void {
  const k = sc.comp;
  const g = k.gain * sc.mix.comp;
  const oct = k.oct || 0;
  const tones = chord.tones.map((x) => x + oct);
  const st = sc.step;
  /* 摇摆：奇数格推后 sw 秒。整个函数的时间都从「小节起点」算，
     所以偏移必须逐格加 —— 由调用方整格加会歪掉其它格。 */
  const grid = (s: number): number => t + s * st + (s % 2 ? sw : 0);

  switch (k.type) {
    case 'pad': {
      // 两小节一个长音：是"空气"不是"和弦"
      const dur = st * sc.steps * 2;
      [0, 1, 2].forEach((i, n) => {
        const pan = n === 0 ? -0.28 : n === 2 ? 0.28 : 0;
        voice(bus, 'saw', tones[i] + (n === 2 ? 12 : 0), t, dur, g * 0.42, pan);
      });
      return;
    }
    case 'waltz': {
      // 蹦-恰-恰：强拍留给贝斯，二、三拍弹和弦
      [4, 8].forEach((s) => {
        if (s >= sc.steps) return;
        [0, 1, 2].forEach((i) => {
          voice(bus, k.inst, tones[i], grid(s), st * 2.4, g * 0.5, (i - 1) * 0.12);
        });
      });
      return;
    }
    case 'hold': {
      [0, 1, 2].forEach((i) => {
        voice(bus, k.inst, tones[i], t, st * sc.steps, g * 0.6, (i - 1) * 0.1);
      });
      return;
    }
    case 'stab': {
      (k.pat || [2, 7, 10]).forEach((s) => {
        if (s >= sc.steps) return;
        [0, 1, 2].forEach((i) => {
          voice(bus, k.inst, tones[i], grid(s), st * 0.9, g * 0.5, (i - 1) * 0.14);
        });
      });
      return;
    }
    case 'riff': {
      // 摇滚：八分音符 power chord（根音 + 五度 + 根音高八度）
      for (let s = 0; s < sc.steps; s += 2) {
        const accent = s === 0 ? 1.15 : s % 4 === 0 ? 1 : 0.86;
        const at = grid(s);
        voice(bus, k.inst, tones[0], at, st * 1.5, g * accent, -0.1, { drive: 0.7 });
        voice(bus, k.inst, tones[0] + 7, at, st * 1.5, g * accent * 0.8, 0.1, { drive: 0.7 });
        voice(bus, k.inst, tones[0] + 12, at, st * 1.2, g * accent * 0.5, 0, { drive: 0.7 });
      }
      return;
    }
    case 'pick': {
      // 指弹分解：低音 → 三音 → 五音 → 三音，两拍一组
      const order = [0, 2, 1, 2, 0, 2, 1, 2];
      order.forEach((idx, i) => {
        const s = i * 2;
        if (s >= sc.steps) return;
        const accent = i % 4 === 0 ? 1.1 : 0.82;
        // 每组的头一个落低八度，做出"交替低音"
        const up = i % 4 === 0 ? 0 : 12;
        voice(bus, k.inst, tones[idx] + up, grid(s), st * 3.2, g * accent * 0.7, i % 2 ? 0.2 : -0.2);
      });
      return;
    }
    default: {
      // arp8 / arp16：琶音填空
      const stepSize = k.type === 'arp16' ? 1 : 2;
      for (let i = 0, s = 0; s < sc.steps; i++, s += stepSize) {
        const idx = sc.arpOrder[i % sc.arpOrder.length];
        voice(bus, k.inst, tones[idx], grid(s), st * (stepSize === 1 ? 0.9 : 1.5), g, s % 4 === 0 ? 0.16 : -0.16);
      }
    }
  }
}

export function scheduleDrums(bus: Bus, sc: Score, t: number, bar: number, sw = 0): void {
  const d = sc.drums;
  const kit = d.kit || 'acoustic';
  const st = sc.step;
  const chip = kit === 'chip';
  const grid = (s: number): number => t + s * st + (s % 2 ? sw : 0);

  d.kick.forEach((s) => {
    if (s >= sc.steps) return;
    kick(bus, grid(s), 0.9, kit);
  });

  d.snare.forEach((s) => {
    if (s >= sc.steps) return;
    drumSample(bus, grid(s), chip ? 0.34 : 0.62, kit, 'snare', 1, 0);
  });

  if (d.hat === 'eighth') {
    for (let s = 0; s < sc.steps; s += 2) {
      drumSample(bus, grid(s), s === 0 ? 0.24 : 0.17, kit, 'hihat', 1, 0.22);
    }
  } else if (d.hat === '16') {
    for (let s = 0; s < sc.steps; s += 1) {
      const g = s % 4 === 0 ? 0.19 : s % 2 === 0 ? 0.13 : 0.09;
      drumSample(bus, grid(s), g, kit, 'hihat', 1, 0.24);
    }
  } else if (d.hat === 'off') {
    for (let s = 1; s < sc.steps; s += 2) {
      drumSample(bus, grid(s), 0.13, kit, 'hihat', 1.05, 0.22);
    }
  }

  d.open.forEach((s) => {
    if (s >= sc.steps) return;
    drumSample(bus, grid(s), 0.2, kit, 'hihat', 0.82, 0.2);
  });

  // 循环最后一小节加个过门，把耳朵推回第一小节
  if (bar === sc.bars - 1 && d.snare.length) {
    for (let i = 0; i < 4; i++) {
      drumSample(bus, grid(sc.steps - 4 + i), 0.12 + i * 0.09, kit, 'snare', 1 + i * 0.05, 0.1);
    }
  }
}

/** 一个十六分位。i 是全局格号。 */
export function scheduleStep(bus: Bus, sc: Score, i: number, t: number): void {
  const bar = Math.floor(i / sc.steps) % sc.bars;
  const s = i % sc.steps;
  const chord = sc.chords[sc.prog[bar]];

  /* 小节开头把和声、低音、鼓一次排完。
     注意不能 return —— 第 0 格上通常也有旋律。 */
  if (s === 0) {
    scheduleBass(bus, sc, chord, t, sc.swing);
    scheduleComp(bus, sc, chord, t, sc.swing);
    scheduleDrums(bus, sc, t, bar, sc.swing);
  }

  const m = sc.lead[bar] && sc.lead[bar][s];
  if (m == null) return;

  const st = sc.step;
  const leadGain = sc.mix.lead;
  // 摇摆：当前格的 s 是奇数就推后。t 已是本格时间，所以只补一次。
  const hit = t + (s % 2 ? sc.swing : 0);
  voice(bus, sc.inst, m, hit, st * 3.2, leadGain, -0.12);
  if (sc.echo) {
    // 延迟回声：3 个十六分位后一条弱的，模拟 ping-pong delay
    voice(bus, sc.inst, m, hit + st * 3, st * 2.4, leadGain * sc.echo, 0.34);
    voice(bus, sc.inst, m, hit + st * 6, st * 2.0, leadGain * sc.echo * 0.45, -0.3);
  }

  // 噪声瞬态给强拍的旋律一点"咬合感"（摇滚和电子都要）
  // lofi 不要：那套鼓的全部功夫都在"不咬"，加个 9kHz 点击就白做了
  const kit = sc.drums.kit;
  if (sc.mix.cut < 6000 && s % 4 === 0 && kit !== 'acoustic' && kit !== 'lofi') {
    noiseHit(bus, hit, 0.02, 0.02, 'highpass', 9000, 0.7);
  }
}
