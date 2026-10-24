/* 和弦名 → 三个音（root 在低音区，tones 在中音区）。
   引擎只支持三和弦：comp 的每种节奏型最多用三个音，pad 用三个 + 一个高八度根音。
   七音 / 九音 / 斜杠低音会按三和弦播放并给一条警告 —— 宁可少一个音，
   也不要"明明写了 Am7 听起来是 Am"却不吭声。 */
import type { Chord } from './bgm/types';

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 三和弦的音程。键按"最长优先"匹配（maj7 不能落到 m 上） */
const TRIADS: Record<string, [number, number, number]> = {
  '': [0, 4, 7],
  maj: [0, 4, 7],
  M: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  '°': [0, 3, 6],
  o: [0, 3, 6],
  aug: [0, 4, 8],
  '+': [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  sus: [0, 5, 7],
  '5': [0, 7, 12],
};

/** 能认出来、但我们只弹三和弦的那些后缀 */
const EXTENSIONS = ['maj7', 'M7', 'm7', 'min7', 'dim7', 'ø7', '7', 'm6', '6', 'maj9', 'M9', 'm9', 'add9', '9', '11', 'm11', '13'];

function baseTriad(q: string): [number, number, number] | null {
  if (q in TRIADS) return TRIADS[q];
  if (!EXTENSIONS.includes(q)) return null;
  if (q.startsWith('dim') || q.startsWith('ø')) return TRIADS.dim;
  if (q.startsWith('aug')) return TRIADS.aug;
  if (q.startsWith('m') && !q.startsWith('maj')) return TRIADS.m;
  return TRIADS[''];
}

export interface ChordResult {
  chord: Chord;
  warning?: string;
}

/** 'Am' / 'F#m7' / 'C/G' / 'Bb' / 'Csus4' → Chord。认不出返回 null（调用方决定兜底）。 */
export function chordOf(name: string): ChordResult | null {
  const n = (name || '').trim().replace(/\s+/g, '');
  if (!n || n === 'N.C.' || n === 'NC') return null;

  const m = /^([A-G])([#b]?)(.*)$/.exec(n);
  if (!m) return null;

  const root = (SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  let q = m[3] || '';
  const warns: string[] = [];

  // 斜杠低音：'C/G'。低音由贝斯声部负责，这里只取三和弦
  if (q.includes('/')) {
    q = q.split('/')[0];
    warns.push('斜杠低音');
  }

  const triad = baseTriad(q);
  if (!triad) return null;

  if (EXTENSIONS.includes(q)) warns.push('七音 / 延伸音');

  const chord: Chord = {
    root: 36 + root,
    tones: [48 + root + triad[0], 48 + root + triad[1], 48 + root + triad[2]],
  };
  return warns.length ? { chord, warning: `${name}：${warns.join('、')}按三和弦播放` } : { chord };
}
