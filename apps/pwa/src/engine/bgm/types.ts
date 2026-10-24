/* bgm 模块共用的类型。
   放在最底层，别的文件只 import 这里，不反向依赖。 */

/** 音色名。前八个是采样乐器，中间四个是合成，最后两个是芯片音（只给像素心跳用）。 */
export type VoiceName =
  | 'piano'
  | 'epiano'
  | 'ebass'
  | 'egt'
  | 'nylon'
  | 'violin'
  | 'cello'
  | 'flute'
  | 'bell'
  | 'pluck'
  | 'saw'
  | 'sub'
  | 'chipLead'
  | 'chipBass';

/** 和声：root 是低音区根音，tones 是和弦音（中音区） */
export interface Chord {
  root: number;
  tones: number[];
}

/** 和声层的节奏型 */
export type CompType = 'pad' | 'waltz' | 'hold' | 'stab' | 'riff' | 'pick' | 'arp8' | 'arp16';

export interface CompSpec {
  type: CompType;
  inst: VoiceName;
  /** 和弦音的八度偏移 */
  oct?: number;
  gain: number;
  /** stab 型用：哪几个十六分位响 */
  pat?: number[];
}

/** 低音层的节奏型 */
export type BassType = 'quarter' | 'eighth' | 'waltz' | 'half' | 'root5' | 'riff';

export interface BassSpec {
  type: BassType;
  inst: VoiceName;
  gain: number;
  oct?: number;
}

export type HatType = 'eighth' | '16' | 'off' | 'none';

export interface DrumSpec {
  kit: string;
  /** 哪几个十六分位响 */
  kick: number[];
  snare: number[];
  hat: HatType;
  open: number[];
}

export interface MixSpec {
  /** 总低通截止：lofi 闷、古典开 */
  cut: number;
  lead: number;
  comp: number;
  bass: number;
  vol: number;
}

/** 一首曲子的完整编曲。排程器只读这个结构。 */
export interface Score {
  id: string;
  bpm: number;
  meter: 3 | 4;
  /** 一小节的十六分位数 */
  steps: number;
  bars: number;
  /** 一个十六分音符的秒数 */
  step: number;
  /** 每小节用第几个和弦 */
  prog: number[];
  chords: Chord[];
  /** 旋律：bars × steps，null 是留白 */
  lead: (number | null)[][];
  inst: VoiceName;
  comp: CompSpec;
  bass: BassSpec;
  drums: DrumSpec;
  mix: MixSpec;
  /** 主旋律回声量 */
  echo: number;
  /** 黑胶底噪量 */
  vinyl: number;
  /** 奇数十六分位推后的秒数。0 = 正拍；lofi 用 0.012 */
  swing: number;
  /** 给曲目系统（backing.js）排伴奏用 */
  bassOct: number[];
  arpOrder: number[];
  arcade: boolean;
}

/** 引擎只需要曲目的这几个字段，不要求完整的 SongDef */
export interface SongLike {
  id?: string;
  bpm?: number;
  meter?: number;
  scene?: string;
  chords?: string[];
  scale?: string;
  arcade?: boolean;
}

/** 音频总线：各模块共享的上下文与缓存 */
export interface Bus {
  ctx: AudioContext;
  master: GainNode;
  lp: BiquadFilterNode;
  /** 白噪声，鼓的瞬态和黑胶底噪都从这里切 */
  noise: AudioBuffer;
  /** 采样缓存：'piano:C4' → AudioBuffer */
  bufs: Record<string, AudioBuffer>;
  vinyl: GainNode | null;
}

/** 采样播放的可选项 */
export interface PlayOpt {
  /** 低通截止 */
  lp?: number;
  /** 失真量 0..1 */
  drive?: number;
  /** 频率微调（叠层用） */
  detune?: number;
  /** 起音时长 */
  attack?: number;
}
