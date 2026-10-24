/* ============================================================
   backing.ts · 编曲层
   ------------------------------------------------------------
   把「每小节一个 pad」升级成有层次的伴奏：鼓组、贝斯、和声、
   加花各自独立，随段落推进。所有事件按 16 分网格生成，再用
   40ms 的 lookahead 提前排进 WebAudio 时钟。

   这一层只认识两件事：SFX（怎么发声）和曲目（弹什么）。
   它不碰画面、不碰 React。
   ============================================================ */
import { SFX } from './sfx';
import { scoreOf } from './bgm/score';
import type { SongLike } from './bgm/types';

const NOTE_SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function chordSemis(name: string): [number, number, number] {
  const m = /^([A-G])(m?)$/.exec(name);
  const root = m ? NOTE_SEMI[m[1]] ?? 0 : 0;
  const minor = m ? m[2] === 'm' : false;
  return minor ? [root, root + 3, root + 7] : [root, root + 4, root + 7];
}

interface Groove {
  kit: string;
  kick: number[];
  snare: number[];
  open: number[];
  /** 每拍几格闭镲，0/undefined 为不加 */
  ghost?: number;
  bass: number[];
  /** 古典：分解和弦的位置 */
  arp?: number[];
  /** 摇滚：扫弦的位置 */
  strum?: number[];
  /** 电子 / lofi：切分和弦的位置 */
  stab?: number[];
  keys: string;
  swing: number;
  human: number;
}

// 每个场景一套编曲性格
const GROOVE: Record<string, Groove> = {
  cyber: {
    kit: 'techno',
    kick: [0, 1, 2, 3],
    snare: [1, 3],
    open: [0.5, 1.5, 2.5, 3.5],
    ghost: 4,          // 每拍 4 个 16 分闭镲
    bass: [0, 0.75, 1.5, 2, 2.75, 3.5],
    stab: [0.5, 1.5, 2.5, 3.5],
    keys: 'lead',
    swing: 0,
    human: 0.002,
  },
  classic: {
    kit: 'acoustic',
    kick: [0, 2],
    snare: [1],
    open: [],
    ghost: 2,          // 8 分踩镲
    bass: [0, 2],
    arp: [0, 0.5, 1, 1.5, 2, 2.5],   // 分解和弦
    keys: 'piano',
    swing: 0,
    human: 0.004,
  },
  lofi: {
    kit: 'kpr77',
    kick: [0, 1.75, 2.5],
    snare: [1, 3],
    open: [],
    ghost: 2,
    bass: [0, 1.5, 2, 3.5],
    stab: [1, 3],
    keys: 'rhodes',
    swing: 0.07,
    human: 0.006,
  },
  rock: {
    kit: 'acoustic',
    kick: [0, 1.5, 2, 2.75],
    snare: [1, 3],
    open: [3.5],
    ghost: 2,
    bass: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    strum: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    keys: 'guitar',
    swing: 0,
    human: 0.003,
  },
};

/** 事件回调的第二个参数：不同层要带不同上下文，用联合类型兜住 */
type Arg = number | string | boolean | undefined;

interface Ev {
  at: number;
  fn: (t: number, arg: Arg) => void;
  arg: Arg;
}

/** 节奏模式的一小节：绝对起点、时长、拍数 */
export interface RhythmBar {
  t: number;
  dur: number;
  ticks: number;
}

/** 排程需要的曲目信息。BGM 的 SongLike 加上编曲必需的字段。 */
export interface ArrangeSong extends SongLike {
  bpm: number;
  meter: number;
  scene: string;
  chords: string[];
}

export type ArrangeMode = 'music' | 'rhythm';

export interface BackingApi {
  events: Ev[];
  idx: number;
  timer: ReturnType<typeof setInterval> | null;
  t0: number;
  nowFn: (() => number) | null;
  mode: ArrangeMode;
  /** 按曲目与模式铺满 bars 小节的伴奏事件 */
  build(song: ArrangeSong, bars: number, mode: ArrangeMode): Ev[];
  /** 固定编曲曲目：把 BGM 那份谱搬来当伴奏 */
  buildArcade(song: ArrangeSong, bars: number): Ev[];
  /** 节奏模式：只有节拍器 + 每小节首拍底鼓 */
  buildRhythm(bars: RhythmBar[], accent: number[], kit: string): Ev[];
  start(t0: number, nowFn: () => number): void;
  tick(): void;
  stop(): void;
}

export const Backing: BackingApi = {
  events: [],
  idx: 0,
  timer: null,
  t0: 0,
  nowFn: null,
  mode: 'music',

  build(song: ArrangeSong, bars: number, mode: ArrangeMode): Ev[] {
    if (mode === 'music' && song.arcade) return this.buildArcade(song, bars);

    const g = GROOVE[song.scene] || GROOVE.lofi;
    const beat = 60 / song.bpm;
    const meter = song.meter;
    const barDur = beat * meter;
    const ev: Ev[] = [];
    const section = (bar: number): number => (bar < 4 ? 0 : bar < 8 ? 1 : bar < 12 ? 2 : 3);

    const push = <A extends Arg>(bar: number, pos: number, fn: (t: number, arg: A) => void, arg: A): void => {
      if (pos >= meter) return;
      ev.push({ at: bar * barDur + pos * beat, fn: fn as (t: number, arg: Arg) => void, arg });
    };

    if (mode === 'rhythm') {
      // 练习模式：节拍器优先，鼓组只做轻微衬底。
      // 鼓组跟随场景（g.kit），换歌就换练习的"鼓房"，而不是全场一套 acoustic。
      for (let bar = 0; bar < bars; bar++) {
        for (let b = 0; b < meter; b++) {
          push(bar, b, (t, a) => SFX.click(t, a as boolean), b === 0);
          if (meter === 4 && (b === 1 || b === 3)) {
            push(bar, b, (t, k) => SFX.drum('snare', t, { gain: 0.13, kit: k as string }), g.kit);
          }
        }
        push(bar, 0, (t, k) => SFX.drum('kick', t, { gain: 0.32, kit: k as string, duck: 0.1 }), g.kit);
      }
    } else {
      for (let bar = 0; bar < bars; bar++) {
        const sec = section(bar);
        const chord = song.chords[bar % song.chords.length];
        const semis = chordSemis(chord);
        const bassRoot = 36 + semis[0];
        const voice = [60 + semis[0], 60 + semis[1], 60 + semis[2]];
        const swingShift = (p: number): number => {
          // 反拍往后挪一点，做出摇摆
          const isOff = Math.abs(p % 1) > 0.1;
          return p + (isOff ? g.swing : 0);
        };

        // —— 鼓 ——
        g.kick.forEach((b) => {
          if (b >= meter) return;
          // 第 2 段之后加一个切分底鼓
          push(bar, b, (t) => SFX.drum('kick', t, { gain: 0.95 }), undefined);
        });
        if (sec >= 2 && meter === 4) {
          push(bar, 3.5, (t) => SFX.drum('kick', t, { gain: 0.55 }), undefined);
        }

        g.snare.forEach((b) => {
          if (b >= meter) return;
          push(bar, b, (t, a) => SFX.drum('snare', t, { gain: a as number, kit: g.kit }), sec >= 1 ? 0.82 : 0.6);
        });

        g.open.forEach((b) => {
          if (b >= meter) return;
          push(bar, b, (t) => SFX.drum('openhat', t, { gain: 0.34 }), undefined);
        });

        if (g.ghost && sec >= 1) {
          const div = g.ghost;               // 每拍的细分数
          for (let i = 0; i < meter * div; i++) {
            const p = i / div;
            if (Math.abs(p % 1) < 0.01) continue;
            // 稀疏化，避免机械
            if ((i * 7 + bar * 3) % 5 === 0) continue;
            push(bar, swingShift(p), (t) => SFX.drum('hat', t, { gain: 0.17 }), undefined);
          }
        }

        // 段落末尾加花
        if (bar === 3 || bar === 7 || bar === 11) {
          const base = meter - 1;
          [0, 0.25, 0.5, 0.75].forEach((d, i) => {
            push(bar, base + d, (t) => SFX.drum('snare', t, { gain: 0.22 + i * 0.09, rate: 1 + i * 0.06 }), undefined);
          });
        }

        // —— 贝斯 ——
        (g.bass || []).forEach((b, i) => {
          if (b >= meter) return;
          const note = i % 4 === 3 ? bassRoot + 7 : bassRoot;
          push(bar, b, (t, n) => SFX.note('bass', n as number, t, { dur: beat * 0.85, gain: 0.95 }), note);
        });

        // —— 和声 ——
        if (g.arp) {
          // 古典：分解和弦
          g.arp.forEach((p, i) => {
            if (p >= meter) return;
            const n = 60 + semis[[0, 1, 2, 1, 2, 0][i % 6]] + (i > 3 ? 12 : 0);
            push(bar, p, (t, m) => SFX.note('piano', m as number, t, {
              dur: beat * 0.9, gain: 0.42, pan: (i % 2 ? 0.14 : -0.14),
            }), n);
          });
        }

        if (g.strum) {
          // 摇滚：强力和弦扫弦
          g.strum.forEach((p) => {
            if (p >= meter) return;
            const acc = Math.abs(p % 1) < 0.01 ? 0.5 : 0.3;
            push(bar, p, (t) => {
              SFX.note('guitar', 48 + semis[0], t, { dur: beat * 0.5, gain: acc, pan: -0.18 });
              SFX.note('guitar', 48 + semis[0] + 7, t, { dur: beat * 0.5, gain: acc * 0.8, pan: 0.18 });
            }, undefined);
          });
        }

        if (g.stab) {
          g.stab.forEach((p) => {
            if (p >= meter) return;
            if (sec === 0 && p % 2 > 1) return;
            push(bar, p, (t) => {
              voice.forEach((m, i) => {
                SFX.note('rhodes', m, t + i * 0.006, {
                  dur: beat * 0.8, gain: 0.24, pan: (i - 1) * 0.2,
                });
              });
            }, undefined);
          });
        }

        // 铺底：长音贯穿整小节
        const padNotes = [bassRoot + 24, bassRoot + 24 + semis[1] - semis[0], bassRoot + 24 + 7];
        push(bar, 0, (t) => {
          SFX.note('pad', padNotes, t, {
            dur: barDur * 1.02,
            gain: sec === 0 ? 0.55 : 0.85,
          });
        }, undefined);
      }
    }

    ev.sort((a, b) => a.at - b.at);
    this.events = ev;
    this.idx = 0;
    this.mode = mode;
    return ev;
  },

  /* 固定编曲曲目：把 BGM 那份谱直接搬过来当伴奏。
     ------------------------------------------------------------
     旋律不在这里排 —— 玩家打的每个音就是旋律音，伴奏只负责贝斯、
     琶音和鼓。所以漏音的时候这三层还在，音乐不会散成一地。
     数据来自 BGM 的 scoreOf(song)，和首页循环播放的是同一份定义。 */
  buildArcade(song: ArrangeSong, bars: number): Ev[] {
    const sc = scoreOf(song);
    if (!sc) { this.events = []; this.idx = 0; this.mode = 'music'; return []; }

    const beat = 60 / song.bpm;
    const sixteenth = beat / 4;
    const barDur = beat * song.meter;
    const ev: Ev[] = [];
    const push = <A extends Arg>(bar: number, s: number, fn: (t: number, arg: A) => void, arg: A): void => {
      ev.push({ at: bar * barDur + s * sixteenth, fn: fn as (t: number, arg: Arg) => void, arg });
    };

    for (let bar = 0; bar < bars; bar++) {
      const src = bar % sc.bars;
      const chord = sc.chords[sc.prog[src]];

      // 贝斯：八个八分位，根音 / 五度 / 高八度
      sc.bassOct.forEach((semi, k) => {
        push(bar, k * 2, (t, n) => {
          SFX.note('chipBass', n as number, t, { dur: sixteenth * 1.7, gain: 0.9 });
        }, chord.root + semi);
      });

      // 琶音：奇数十六分位填空，音量压到刚能听出「有和声」
      for (let s = 1; s < 16; s += 2) {
        const idx = sc.arpOrder[((s - 1) / 2) % sc.arpOrder.length];
        push(bar, s, (t, n) => {
          SFX.note('chipLead', n as number, t, { dur: sixteenth * 0.85, gain: 0.16, pan: 0.22 });
        }, chord.tones[idx] + 12);
      }

      // 鼓：底鼓 1/4/4&、军鼓 2/4、踩镲八分位
      [0, 6, 8].forEach((s) => push(bar, s, (t) => SFX.drum('kick', t, { gain: 0.9, kit: 'chip' }), undefined));
      [4, 12].forEach((s) => push(bar, s, (t) => SFX.drum('snare', t, { gain: 1, kit: 'chip' }), undefined));
      for (let s = 0; s < 16; s += 2) {
        push(bar, s, (t, g) => SFX.drum('hat', t, { gain: g as number, kit: 'chip' }), s === 0 ? 0.75 : 0.52);
      }
    }

    ev.sort((a, b) => a.at - b.at);
    this.events = ev;
    this.idx = 0;
    this.mode = 'music';
    return ev;
  },

  /* 节奏模式：没有伴奏，只有节拍器。
     每小节自带 bpm（每 16 小节 +10），所以完全按传入的时间轴排，
     重音轮廓由风格决定（4/4 落在 1、3，7/8 落在 1、4、6）。
     底鼓只在每小节第一拍点一下，给个"节"的落点。 */
  buildRhythm(bars: RhythmBar[], accent: number[], kit: string): Ev[] {
    const ev: Ev[] = [];

    bars.forEach((bar) => {
      const unit = bar.dur / bar.ticks;          // 一拍：4/4 是四分，7/8 是八分
      for (let k = 0; k < bar.ticks; k++) {
        const idx = Math.min(accent.length - 1, Math.round(k * unit * 2));
        ev.push({
          at: bar.t + k * unit,
          fn: (t, a) => SFX.click(t, a as boolean),
          arg: accent[idx] >= 0.8,
        });
      }
      ev.push({
        at: bar.t,
        fn: (t, k) => SFX.drum('kick', t, { gain: 0.26, kit: k as string, duck: 0.08 }),
        arg: kit,
      });
    });

    ev.sort((a, b) => a.at - b.at);
    this.events = ev;
    this.idx = 0;
    this.mode = 'rhythm';
    return ev;
  },

  start(t0: number, nowFn: () => number): void {
    this.stop();
    this.t0 = t0;
    this.nowFn = nowFn;
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  },

  tick(): void {
    const nowFn = this.nowFn || (() => 0);
    const t0 = this.t0;
    const horizon = nowFn() - t0 + 0.4;
    while (this.idx < this.events.length && this.events[this.idx].at < horizon) {
      const e = this.events[this.idx++];
      const t = t0 + e.at;
      if (t > nowFn() - 0.06) {
        try { e.fn(t, e.arg); } catch { /* 单条事件失败不该停掉整段伴奏 */ }
      }
    }
    if (this.idx >= this.events.length && nowFn() - t0 > 0.6) this.stop();
  },

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  },
};
