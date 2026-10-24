/* 把「曲目定义」变成「编曲数据」。
   有手写编曲的走 COMPOSE，没有的退到参数生成。
   生成器写不出动机，出来的旋律每小节一个形状 —— 只配当兜底。 */
import type { Chord, Score, SongLike } from './types';
import { COMPOSE, FALLBACK_VOICE } from './compose';

export const BARS = 8;

const NOTE_SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const MOTIFS = [
  [0, 1, 2, 1, 2, 1],
  [2, 1, 0, 1, 2, 0],
  [0, 2, 1, 0, 1, 2],
  [1, 2, 0, 2, 1, 0],
  [2, 0, 2, 1, 2, 3],
];
const ONSETS = [0, 2, 4, 6, 8, 10];
const PROG_SHAPE = [0, 0, 1, 1, 2, 2, 3, 3];
const ARP_ORDER = [0, 1, 2, 1];
const BASS_OCT = [0, 0, 7, 0, 0, 7, 0, 12];

export const FALLBACK_SONG: SongLike = {
  id: 'arcade',
  bpm: 132,
  meter: 4,
  scene: 'pixel',
  chords: ['Am', 'F', 'C', 'G'],
  scale: 'min',
  arcade: true,
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chordSemis(name: string): [number, number, number] {
  const m = /^([A-G])(m?)$/.exec(name);
  const root = m ? NOTE_SEMI[m[1]] : 0;
  const minor = m ? m[2] === 'm' : false;
  return minor ? [root, root + 3, root + 7] : [root, root + 4, root + 7];
}

/** 兜底旋律：从和弦音里按种子挑动机 */
function melodyFor(chords: Chord[], prog: number[], steps: number, seed: number, scale: string): (number | null)[][] {
  const rnd = mulberry32(seed);
  const motif = MOTIFS[seed % MOTIFS.length];
  const rows: (number | null)[][] = [];

  /* 和弦音在不同的调上会跨到不同八度（F 的三音就在 C 的八度上方），
     直接拿来当旋律会让音域忽高忽低。折回一个八度里，听感统一。 */
  const fold = (m: number): number => {
    let x = m;
    while (x >= 80) x -= 12;
    return x;
  };

  for (let bar = 0; bar < BARS; bar++) {
    const chord = chords[prog[bar]];
    const row: (number | null)[] = new Array(steps).fill(null);

    for (let i = 0; i < ONSETS.length; i++) {
      const s = ONSETS[i];
      if (s >= steps) continue;
      // 旋律坐在和弦音上方两个八度；琶音占着 +12 那一层
      const lift = bar >= BARS - 2 && i % 3 === 2 ? 12 : 0;
      const pick = motif[i % motif.length];
      const m =
        pick === 3
          ? fold(chord.tones[0] + 24 + (scale === 'min' ? 10 : 9))
          : fold(chord.tones[pick] + 24) + lift;
      // 每四小节收尾漏一个音，避免机械
      if (bar % 4 === 3 && i === 4 && rnd() < 0.55) continue;
      row[s] = m;
    }
    rows.push(row);
  }
  return rows;
}

export function buildScore(song?: SongLike): Score {
  const s = song || FALLBACK_SONG;
  const bpm = s.bpm || 96;
  const meter: 3 | 4 = s.meter === 3 ? 3 : 4;
  const steps = meter * 4;
  const names = s.chords && s.chords.length ? s.chords : (FALLBACK_SONG.chords as string[]);
  const hand = s.id ? COMPOSE[s.id] : undefined;
  const fb = FALLBACK_VOICE[s.scene || 'cyber'] || FALLBACK_VOICE.cyber;

  const chords: Chord[] = names.map((n) => {
    const semi = chordSemis(n);
    return { root: 36 + semi[0], tones: [48 + semi[0], 48 + semi[1], 48 + semi[2]] };
  });

  const prog: number[] = [];
  for (let bar = 0; bar < BARS; bar++) prog.push(PROG_SHAPE[bar] % chords.length);

  return {
    id: s.id || 'unknown',
    bpm,
    meter,
    steps,
    bars: BARS,
    step: 60 / bpm / 4,
    prog,
    chords,
    lead: hand ? hand.lead : melodyFor(chords, prog, steps, hashStr(s.id || 'x'), s.scale || 'maj'),
    inst: hand ? hand.inst : fb.inst,
    comp: hand
      ? hand.comp
      : { type: meter === 3 ? 'waltz' : 'arp8', inst: fb.inst, oct: 12, gain: 0.24 },
    pad: hand ? hand.pad : undefined,
    bass: hand ? hand.bass : { type: meter === 3 ? 'waltz' : 'eighth', inst: fb.bass, gain: 0.55 },
    drums: hand
      ? hand.drums
      : {
          kit: fb.kit,
          kick: meter === 3 ? [0] : [0, 8],
          snare: meter === 3 ? [4, 8] : [4, 12],
          hat: meter === 3 ? 'none' : 'eighth',
          open: [],
        },
    mix: hand
      ? hand.mix
      : { cut: fb.cut, lead: 0.34, comp: 0.24, bass: 0.55, vol: 1 },
    echo: hand && hand.echo ? hand.echo : 0,
    tape: hand && hand.tape ? hand.tape : 0,
    swing: hand && hand.swing ? hand.swing : 0,
    // 曲目系统（backing.js）按这几个字段排伴奏与谱面
    bassOct: meter === 3 ? [0, 0, 7, 0, 7, 12] : BASS_OCT,
    arpOrder: ARP_ORDER,
    arcade: !!s.arcade,
  };
}

/* 编曲按「曲目 + 速度 + 拍号 + 和弦」缓存：同一首曲子反复进出首页，
   结果必须完全一致，否则用户会听到另一段旋律。 */
const cache = new Map<string, Score>();

export function scoreOf(song?: SongLike): Score {
  const s = song || FALLBACK_SONG;
  const key = [s.id, s.bpm, s.meter, s.scene, (s.chords || []).join('')].join('|');
  let sc = cache.get(key);
  if (!sc) {
    sc = buildScore(s);
    cache.set(key, sc);
  }
  return sc;
}
