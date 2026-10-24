/* 鼓：采样优先，缺资源时退到合成。
   chip 套鼓没有采样 —— 8bit 的鼓本来就是算出来的，硬塞真鼓反而不对味。
   lofi 套鼓也没有采样 —— 那套鼓要的是软起音、高频收、每次都不一样，
   采样反而不方便改（见 src/engine/lofi-kit.ts）。 */
import type { Bus } from './types';
import { out, noiseHit } from './voices';
import { lofiHit } from '../lofi-kit';

export function kick(bus: Bus, t: number, gain: number, kit: string): void {
  const c = bus.ctx;

  if (kit === 'lofi') {
    lofiHit(c, bus.master, 'kick', t, gain);
    return;
  }

  const buf = bus.bufs[`drum:${kit}:kick`];

  if (buf) {
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g);
    out(bus, g, 0);
    src.start(t);
    return;
  }

  // 芯片鼓：正弦快速扫频
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.085);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.21);
  o.connect(g);
  out(bus, g, 0);
  o.start(t);
  o.stop(t + 0.23);
}

export function drumSample(
  bus: Bus,
  t: number,
  gain: number,
  kit: string,
  hit: string,
  rate = 1,
  pan = 0,
): void {
  const c = bus.ctx;

  if (kit === 'lofi') {
    // 开镲在采样路径是靠把 hihat 降速拉长（rate 0.82），合成侧直接换一层
    const open = hit === 'hihat' && rate < 0.9;
    const name = open ? 'openhat'
      : hit === 'hihat' ? 'hat'
      : hit === 'snare' ? 'snare'
      : hit === 'kick' ? 'kick'
      : 'tom';
    lofiHit(c, bus.master, name, t, gain, { pan });
    return;
  }

  const buf = bus.bufs[`drum:${kit}:${hit}`];

  if (!buf) {
    // 芯片套鼓走噪声；真实套鼓缺采样时也让瞬态顶一下，别整个空掉
    if (kit === 'chip') {
      if (hit === 'snare') noiseHit(bus, t, 0.055, gain, 'highpass', 1400, 0.8);
      else noiseHit(bus, t, 0.03, gain, 'highpass', 7200, 0.7);
      return;
    }
    const isSnare = hit === 'snare';
    noiseHit(bus, t, isSnare ? 0.09 : 0.03, gain, isSnare ? 'bandpass' : 'highpass', isSnare ? 1800 : 7000, 0.8);
    return;
  }

  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g);
  out(bus, g, pan);
  src.start(t);
}
