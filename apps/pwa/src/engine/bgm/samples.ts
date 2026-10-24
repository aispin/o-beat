/* 采样清单与加载。
   源：tonejs-instruments（MIT 打包），采样本体是 CC0 的 VSCO2 CE / Iowa /
   Karoryfer，已经落到 public/assets，随构建一起发布，不走 CDN。

   每件乐器只留 6–9 个音，播放时取最近的一个做 playbackRate 变速。
   相邻采样最多差 3 个半音，再远就会听出"磁带跑调"。 */
import type { Bus, Score } from './types';

export const SAMPLES: Record<string, { dir: string; notes: string[] }> = {
  piano: { dir: 'piano', notes: ['C3', 'G3', 'C4', 'F4', 'As4', 'Ds5', 'Gs5', 'C6'] },
  ebass: { dir: 'inst/bass-electric', notes: ['E1', 'G1', 'As1', 'Cs2', 'E2', 'G2', 'As2', 'Cs3'] },
  egt: { dir: 'inst/guitar-electric', notes: ['E2', 'A2', 'C3', 'Fs3', 'A3', 'C4', 'Fs4', 'A4', 'C5'] },
  nylon: { dir: 'inst/guitar-nylon', notes: ['E2', 'A2', 'D3', 'G3', 'Cs4', 'Fs4', 'B4', 'E5', 'A5'] },
  violin: { dir: 'inst/violin', notes: ['G3', 'C4', 'E4', 'A4', 'C5', 'E5', 'G5', 'C6'] },
  cello: { dir: 'inst/cello', notes: ['C2', 'G2', 'D3', 'A3', 'C4', 'G4'] },
  flute: { dir: 'inst/flute', notes: ['C4', 'E4', 'A4', 'C5', 'E5', 'A5', 'C6'] },
};

/** 音色名 → 实际采样集。电钢是"钢琴采样压掉高频"，不是另一套文件。 */
export const SAMPLE_ALIAS: Record<string, string> = { epiano: 'piano' };

/** 有采样鼓的套鼓。chip 是合成的，不在这里。 */
export const KITS = ['acoustic', 'techno', 'kpr77'];

export const HITS = ['kick', 'snare', 'hihat', 'tom1'];

const NOTE_SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'As4' → 70 */
export function toMidi(note: string): number {
  const m = /^([A-G])(s?)(-?\d+)$/.exec(note);
  if (!m) return 60;
  return 12 * (Number(m[3]) + 1) + NOTE_SEMI[m[1]] + (m[2] ? 1 : 0);
}

/** 每件乐器的采样按音高排好，播放时找最近的一个 */
const INDEX: Record<string, { midi: number; key: string }[]> = {};
Object.keys(SAMPLES).forEach((name) => {
  INDEX[name] = SAMPLES[name].notes
    .map((n) => ({ midi: toMidi(n), key: `${name}:${n}` }))
    .sort((a, b) => a.midi - b.midi);
});

export async function fetchBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return await ctx.decodeAudioData(await res.arrayBuffer());
}

/** 这套编曲要加载哪些采样：音色名 + 鼓组 */
export function needSamples(sc: Score): string[] {
  const set = new Set<string>();
  [sc.inst, sc.comp.inst, sc.bass.inst].forEach((n) => {
    const real = SAMPLE_ALIAS[n] || n;
    if (SAMPLES[real]) set.add(real);
  });
  if (KITS.indexOf(sc.drums.kit) >= 0) set.add(`drum:${sc.drums.kit}`);
  return Array.from(set).sort();
}

const BASE = () => new URL('assets/', globalThis.location.href).href;

/** 补齐这批采样的缓存。单个文件失败不影响其它。 */
export async function ensureSamples(bus: Bus, need: string[]): Promise<void> {
  const base = BASE();
  const jobs: Promise<unknown>[] = [];

  need.forEach((n) => {
    if (n.startsWith('drum:')) {
      const kit = n.slice(5);
      const dir = kit;
      HITS.forEach((h) => {
        const key = `drum:${kit}:${h}`;
        if (bus.bufs[key]) return;
        jobs.push(
          fetchBuffer(bus.ctx, `${base}drums/${dir}/${h}.mp3`).then((b) => {
            bus.bufs[key] = b;
          }),
        );
      });
      return;
    }
    const spec = SAMPLES[n];
    if (!spec) return;
    spec.notes.forEach((note) => {
      const key = `${n}:${note}`;
      if (bus.bufs[key]) return;
      jobs.push(
        fetchBuffer(bus.ctx, `${base}${spec.dir}/${note}.mp3`).then((b) => {
          bus.bufs[key] = b;
        }),
      );
    });
  });

  await Promise.all(jobs.map((j) => j.catch(() => null)));
}

/** 找最接近 midi 的采样。没有采样（或还没加载完）返回 null。 */
export function pickSample(bus: Bus, name: string, midi: number): { buf: AudioBuffer; rate: number } | null {
  const idx = INDEX[name];
  if (!idx) return null;
  let best = idx[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const it of idx) {
    const d = Math.abs(it.midi - midi);
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  const buf = bus.bufs[best.key];
  if (!buf) return null;
  return { buf, rate: Math.pow(2, (midi - best.midi) / 12) };
}
