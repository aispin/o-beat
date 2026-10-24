/* 七首曲子的手写编曲 —— 纯数据，没有逻辑。
   改旋律、换音色、调音量都只动这个文件，不用碰排程器。

   为什么手写而不是生成：上一版按「和弦音 + 种子挑动机」生成旋律，
   结果每首都是"每小节六个等距音"，听十秒就分不清是哪首。
   手写才有动机、有呼吸、有句尾。

   旋律写成字符串，一小节一行，16 格（3/4 是 12 格），`.` 是留白。
   用绝对 MIDI 而不是音级：能直接看出走向，也方便对着和弦校对。 */
import type { BassSpec, CompSpec, DrumSpec, MixSpec, PadSpec, VoiceName } from './types';

export interface Composition {
  inst: VoiceName;
  lead: (number | null)[][];
  comp: CompSpec;
  /** 铺底垫：8 小节一片的空气，见 arrange.ts 的 schedulePad */
  pad?: PadSpec;
  bass: BassSpec;
  drums: DrumSpec;
  mix: MixSpec;
  /** 主旋律回声量（synthwave 的 ping-pong delay） */
  echo?: number;
  /** 磁带底噪量（嘶声 + 噼啪） */
  tape?: number;
  swing?: number;
}

const seq = (rows: string[]): (number | null)[][] =>
  rows.map((r) =>
    r
      .trim()
      .split(/\s+/)
      .map((v) => (v === '.' ? null : Number(v))),
  );

/* 「像素心跳」：首页循环和曲目谱面共用这一份 ——
   玩家弹的每个音就是这里听到的旋律。 */
export const ARCADE_MEL: (number | null)[][] = seq([
  '76 . 76 . 79 . 76 . 74 . 72 . . . . .',
  '72 . 72 . 74 . 72 . 71 . 69 . . . . .',
  '69 . 72 . 77 . 76 . 72 . 69 . . . . .',
  '71 . 74 . 79 . 77 . 74 . 71 . . . . .',
  '76 . 76 . 81 . 79 . 76 . 74 . . . . .',
  '72 . 74 . 76 . 77 . 76 . 72 . . . . .',
  '74 . 71 . 74 . 77 . 79 . 77 . . . . .',
  '76 . . . 72 . . . 69 . . . . . . .',
]);

export const COMPOSE: Record<string, Composition> = {
  /* 霓虹脉冲 · synthwave
     宽垫铺底、FM 钟唱主旋律、稳定四四拍。回声是它的空间感来源。 */
  neon: {
    inst: 'bell',
    lead: seq([
      '76 . . . 79 . . . 81 . . . 79 . . .',
      '. . 74 . 76 . . . 79 . . . . . . .',
      '72 . . . 76 . . . 77 . . . 76 . . .',
      '. . 69 . 72 . . . 74 . . . . . . .',
      '77 . . . 81 . . . 79 . . . 77 . . .',
      '76 . . . 74 . . . 72 . . . . . . .',
      '74 . . . 79 . . . 77 . . . 74 . . .',
      '71 . . . 74 . . . 79 . . . . . . .',
    ]),
    comp: { type: 'pad', inst: 'saw', oct: 0, gain: 0.34 },
    bass: { type: 'eighth', inst: 'ebass', gain: 0.62 },
    drums: { kit: 'techno', kick: [0, 4, 8, 12], snare: [4, 12], hat: 'off', open: [6, 14] },
    mix: { cut: 13000, lead: 0.38, comp: 0.28, bass: 0.62, vol: 0.72 },
    echo: 0.28,
  },

  /* 城市夜行 · 都市电子
     切分拨弦 + 电钢填空 + 闷 sub。音符故意落在弱拍上，才有"夜行"的摇摆。 */
  city: {
    inst: 'pluck',
    lead: seq([
      '71 . 74 . . 71 . . 74 . 76 . . . . .',
      '. . 74 . 71 . . . 67 . . . . . . .',
      '69 . 73 . . 69 . . 74 . 76 . . . . .',
      '. . 73 . 69 . . . 66 . . . . . . .',
      '67 . 71 . . 67 . . 72 . 74 . . . . .',
      '. . 71 . 67 . . . 64 . . . . . . .',
      '72 . 76 . . 72 . . 74 . 72 . . . . .',
      '. . 71 . 67 . . . 71 . . . . . . .',
    ]),
    comp: { type: 'stab', inst: 'epiano', oct: 12, gain: 0.34, pat: [2, 7, 10] },
    bass: { type: 'half', inst: 'sub', gain: 0.40 },
    drums: { kit: 'kpr77', kick: [0, 3, 8, 11], snare: [4, 12], hat: '16', open: [] },
    mix: { cut: 9000, lead: 0.44, comp: 0.34, bass: 0.40, vol: 0.86 },
  },

  /* 月下圆舞 · 钢琴三重奏
     小提琴唱旋律、钢琴走「蹦-恰-恰」、大提琴托底。没有鼓 —— 古典不需要。 */
  waltz: {
    inst: 'violin',
    lead: seq([
      '77 . . 81 . . 79 . . 77 . .',
      '79 . . 81 . . 84 . . 81 . .',
      '76 . . 79 . . 84 . . 79 . .',
      '77 . . 76 . . 74 . . 72 . .',
      '81 . . 84 . . 82 . . 81 . .',
      '79 . . 77 . . 76 . . 74 . .',
      '72 . . 76 . . 79 . . 81 . .',
      '84 . . 83 . . 82 . . 79 . .',
    ]),
    comp: { type: 'waltz', inst: 'piano', oct: 12, gain: 0.40 },
    bass: { type: 'waltz', inst: 'cello', gain: 0.58 },
    drums: { kit: 'acoustic', kick: [], snare: [], hat: 'none', open: [] },
    mix: { cut: 11000, lead: 0.46, comp: 0.40, bass: 0.58, vol: 1.5 },
  },

  /* 长呼吸 · lofi
     软钢琴唱旋律、梦幻垫铺底、连奏软贝斯、合成鼓、磁带底噪。
     慢、空、闷、糯、脏、松，六样齐。 */
  breath: {
    inst: 'softPiano',
    lead: seq([
      '72 . . . . . 76 . 79 . . . . . . .',
      '. . . . 72 . . . . . . . . . . .',
      '77 . . . . . 81 . 79 . . . . . . .',
      '. . . . 79 . . . . . . . . . . .',
      '76 . . . . . 79 . 76 . . . 74 . . .',
      '. . . . 72 . . . . . . . . . . .',
      '74 . . . . . 71 . 74 . . . . . . .',
      '. . . . 79 . . . . . . . . . . .',
    ]),
    comp: { type: 'arp8', inst: 'nylon', oct: 12, gain: 0.22 },
    pad: { gain: 0.042, rev: 0.55 },
    /* 低音线：每两小节「根音 → 一个把耳朵带去下一个和弦的音」。
       G 落在 Am 上是七音、落在 F 上是九音，都是"能往前走的音"，
       不是"把和弦弹一遍"。时值由 arrange.ts 按到下一个音的距离算成连奏。 */
    bass: {
      type: 'line',
      inst: 'bassLofi',
      gain: 0.42,
      line: seq([
        '45 . . . . . . . . . . . . . . .',
        '. . . . . . . . 43 . . . . . . .',
        '41 . . . . . . . . . . . . . . .',
        '. . . . . . . . 45 . . . . . . .',
        '36 . . . . . 43 . . . . . . . . .',
        '. . . . . . . . . . . . 38 . . .',
        '43 . . . . . . . . . . . . . . .',
        '. . . . . . . . 40 . . . . . . .',
      ]),
    },
    drums: { kit: 'lofi', kick: [0, 10], snare: [4, 12], hat: 'off', open: [] },
    mix: { cut: 3200, lead: 0.46, comp: 0.24, bass: 0.52, vol: 1.0 },
    tape: 0.13,
    swing: 0.012,
  },

  /* 雨窗午后 · 指弹民谣（归在 lofi 场景）
     软钢琴唱五声旋律、尼龙弦指弹、软贝斯托底、没有踩镲。
     cut 开到 8000：指弹的指甲颗粒要留着，只砍掉空气。 */
  rain: {
    inst: 'softPiano',
    lead: seq([
      '74 . 76 . 78 . . . 81 . . . 78 . . .',
      '. . 76 . 74 . . . . . . . . . . .',
      '74 . . . 79 . 81 . 79 . . . 74 . . .',
      '. . . . 79 . . . . . . . . . . .',
      '76 . . . 81 . 83 . 81 . . . 76 . . .',
      '. . . . 76 . . . . . . . . . . .',
      '78 . . . 81 . . . 86 . . . 81 . . .',
      '. . . . 78 . . . . . . . . . . .',
    ]),
    comp: { type: 'pick', inst: 'nylon', oct: 12, gain: 0.30 },
    pad: { gain: 0.036, rev: 0.5 },
    /* 每两小节「根音 → 三音」，而每个三音都是一个半音级进到下一个根音：
       F#→G、B→A、C#→D。这就是"贝斯和旋律有和声关系"最省力的做法。 */
    bass: {
      type: 'line',
      inst: 'bassLofi',
      gain: 0.38,
      line: seq([
        '38 . . . . . . . . . . . . . . .',
        '. . . . . . . . 42 . . . . . . .',
        '43 . . . . . . . . . . . . . . .',
        '. . . . . . . . 47 . . . . . . .',
        '45 . . . . . . . . . . . . . . .',
        '. . . . . . . . 49 . . . . . . .',
        '38 . . . . . . . . . . . . . . .',
        '. . . . . . . . 42 . . . . . . .',
      ]),
    },
    drums: { kit: 'lofi', kick: [0, 8], snare: [4, 12], hat: 'none', open: [] },
    mix: { cut: 8000, lead: 0.40, comp: 0.28, bass: 0.40, vol: 1.0 },
    tape: 0.10,
  },

  /* 地下现场 · 摇滚
     失真电吉他 riff + 八分音符 power chord + 重鼓。低音走八分音符顶住。 */
  live: {
    inst: 'egt',
    lead: seq([
      '72 . . . 75 . 72 . 70 . . . 72 . . .',
      '. . . . 72 . . . 70 . . . . . . .',
      '77 . . . 81 . 77 . 75 . . . 77 . . .',
      '. . . . 77 . . . 75 . . . . . . .',
      '79 . . . 83 . 79 . 77 . . . 79 . . .',
      '. . . . 79 . . . 77 . . . . . . .',
      '69 . . . 72 . 69 . 67 . . . 69 . . .',
      '. . . . 69 . . . 67 . . . . . . .',
    ]),
    comp: { type: 'riff', inst: 'egt', oct: 0, gain: 0.22 },
    bass: { type: 'eighth', inst: 'ebass', gain: 0.80 },
    drums: { kit: 'acoustic', kick: [0, 6, 8], snare: [4, 12], hat: 'eighth', open: [] },
    mix: { cut: 6400, lead: 0.36, comp: 0.24, bass: 0.80, vol: 0.55 },
  },

  /* 像素心跳 · 8bit
     唯一的芯片音色。旋律就是谱面，听到的和要打的是同一份。 */
  arcade: {
    inst: 'chipLead',
    lead: ARCADE_MEL,
    comp: { type: 'arp8', inst: 'chipLead', oct: 12, gain: 0.052 },
    bass: { type: 'eighth', inst: 'chipBass', gain: 0.22 },
    drums: { kit: 'chip', kick: [0, 6, 8], snare: [4, 12], hat: 'eighth', open: [] },
    mix: { cut: 8200, lead: 0.16, comp: 0.052, bass: 0.22, vol: 1.15 },
  },
};

/** 未知曲目兜底：按场景给一套性格，旋律仍由生成器写 */
export const FALLBACK_VOICE: Record<string, { inst: VoiceName; bass: VoiceName; cut: number; kit: string }> = {
  pixel: { inst: 'chipLead', bass: 'chipBass', cut: 8200, kit: 'chip' },
  cyber: { inst: 'pluck', bass: 'sub', cut: 7600, kit: 'kpr77' },
  classic: { inst: 'piano', bass: 'cello', cut: 11000, kit: 'acoustic' },
  lofi: { inst: 'softPiano', bass: 'bassLofi', cut: 3200, kit: 'lofi' },
  rock: { inst: 'egt', bass: 'ebass', cut: 5200, kit: 'acoustic' },
};
