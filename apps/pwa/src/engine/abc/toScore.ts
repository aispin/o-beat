/* ABC 谱 + 风格 → 引擎的 Score。
   五层映射：
     V: name="lead" → 旋律 + 每个音的时值
     V: name="bass" → 低音线（时值仍由"到下一个音的距离"算，保持连奏）
     "Am" 和弦记号 → 每小节的和弦（prog / chords）
     %%OB → 铺底、和声节奏型、鼓、混音、底噪、摇摆
   谱里不写的东西一律取风格预设，所以一份谱能换风格听。 */
import type { Chord, Score, SongLike } from '../bgm/types';
import type { AbcNote } from './parse';
import { parseAbc } from './parse';
import { resolveStyle } from './style';
import { chordOf } from '../chords';
import { ARP_ORDER, BASS_OCT, PROG_SHAPE } from '../bgm/compose';

interface Grid {
  notes: (number | null)[][];
  durs: number[][];
}

/** 事件 → bars × steps 的格子。同一个格子里有两个音时按 pick 取一个（和弦拆成单音旋律）。 */
function gridOf(events: AbcNote[], steps: number, bars: number, pick: 'high' | 'low'): Grid {
  const notes: (number | null)[][] = Array.from({ length: bars }, () => new Array<number | null>(steps).fill(null));
  const durs: number[][] = Array.from({ length: bars }, () => new Array<number>(steps).fill(0));

  events.forEach((e) => {
    if (e.bar < 0 || e.bar >= bars || e.step < 0 || e.step >= steps) return;
    const prev = notes[e.bar][e.step];
    if (prev == null) {
      notes[e.bar][e.step] = e.midi;
      durs[e.bar][e.step] = e.dur;
    } else if (pick === 'high' ? e.midi > prev : e.midi < prev) {
      notes[e.bar][e.step] = e.midi;
      durs[e.bar][e.step] = e.dur;
    }
  });

  return { notes, durs };
}

function findVoice(voices: { name: string; id: string }[], names: string[]): number {
  for (const n of names) {
    const i = voices.findIndex((v) => v.name.toLowerCase() === n);
    if (i >= 0) return i;
  }
  return -1;
}

/** 谱 + 风格 → Score。song.id / scene / arcade 仍由曲目定义提供（那是产品层的字段）。 */
export function scoreFromAbc(text: string, song: SongLike, styleHint?: string): Score {
  const tune = parseAbc(text);
  const warnings = tune.warnings;
  const style = resolveStyle(tune.directives, styleHint || song.scene || 'lofi', warnings);

  const meter: 3 | 4 = tune.meter === 3 ? 3 : 4;
  const steps = tune.steps;
  const bars = Math.max(1, tune.bars);

  if (song.bpm && Math.abs(song.bpm - tune.bpm) > 0.5) {
    warnings.push(`曲目定义 bpm ${song.bpm} 与谱面 Q:${tune.bpm} 不一致，以谱面为准`);
  }

  // 声部：按名字找，找不到 lead 就用第一个
  const vs = tune.voices;
  let leadIdx = findVoice(vs, ['lead', 'melody', 'mel']);
  if (leadIdx < 0 && vs.length) leadIdx = 0;
  const bassIdx = findVoice(vs, ['bass', 'low']);

  const lead = leadIdx >= 0 ? gridOf(vs[leadIdx].events, steps, bars, 'high') : { notes: [], durs: [] };
  const bassGrid =
    bassIdx >= 0 ? gridOf(vs[bassIdx].events, steps, bars, 'low').notes : undefined;

  // 和弦：记号按小节对齐，没写就退回曲目定义里的四和弦循环
  const chordNames: string[] = [];
  if (tune.chords.length) {
    const barOf = (abs: number): number => Math.floor(abs / steps);
    tune.chords.forEach((c) => {
      if (c.step % steps !== 0) {
        warnings.push(`和弦 ${c.name} 落在第 ${barOf(c.step) + 1} 小节的第 ${c.step % steps} 格，引擎按整小节算`);
      }
    });
    for (let b = 0; b < bars; b++) {
      let name = '';
      for (const c of tune.chords) {
        if (barOf(c.step) <= b) name = c.name;
        else break;
      }
      chordNames.push(name || (b > 0 ? chordNames[b - 1] : ''));
    }
  } else if (song.chords && song.chords.length) {
    const list = song.chords;
    for (let b = 0; b < bars; b++) chordNames.push(list[PROG_SHAPE[b % PROG_SHAPE.length] % list.length]);
  }

  const unique: string[] = [];
  const prog: number[] = chordNames.map((n) => {
    let i = unique.indexOf(n);
    if (i < 0) {
      unique.push(n);
      i = unique.length - 1;
    }
    return i;
  });

  const chords: Chord[] = unique.map((n) => {
    const r = chordOf(n);
    if (!r) {
      if (n) warnings.push(`和弦 ${n} 认不出，按 C 处理`);
      const fb = chordOf('C');
      return (fb as { chord: Chord }).chord;
    }
    if (r.warning) warnings.push(r.warning);
    return r.chord;
  });

  if (import.meta.env.DEV && warnings.length) {
    console.warn(`[abc] ${song.id || tune.id}：${warnings.join('；')}`);
  }

  const bass = style.bass;

  return {
    id: song.id || tune.id || 'abc',
    bpm: tune.bpm,
    meter,
    steps,
    bars,
    step: 60 / tune.bpm / 4,
    prog,
    chords,
    lead: lead.notes,
    leadDur: lead.durs,
    inst: style.inst,
    comp: style.comp,
    pad: style.pad,
    bass: bassGrid ? { ...bass, type: 'line', line: bassGrid } : { ...bass },
    drums: style.drums,
    mix: style.mix,
    echo: style.echo,
    tape: style.tape,
    swing: style.swing,
    bassOct: meter === 3 ? [0, 0, 7, 0, 7, 12] : BASS_OCT,
    arpOrder: ARP_ORDER,
    arcade: !!song.arcade,
  };
}
