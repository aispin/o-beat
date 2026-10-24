/* 风格预设：一个风格 = 一套编制 + 一套混音开口 + 空间参数。
   谱（ABC）只写"音符与和弦"，这里写"用什么东西演奏它"。

   `%%OB style lofi` 取整套预设，其余 `%%OB ...` 逐项覆盖。
   覆盖是逐字段的：写 `%%OB mix cut=8000` 只改截止频率，lead/comp/bass 仍是预设值。 */
import type { BassSpec, CompSpec, CompType, DrumSpec, HatType, MixSpec, PadSpec, VoiceName } from '../bgm/types';

export interface SongStyle {
  inst: VoiceName;
  comp: CompSpec;
  /** 铺底垫。摇滚 / 电子 / 芯片不要这一层就不写 */
  pad?: PadSpec;
  /** 谱里没写贝斯声部时的节奏型；写了 line 就按谱走 */
  bass: BassSpec;
  drums: DrumSpec;
  mix: MixSpec;
  tape: number;
  swing: number;
  echo: number;
}

/* 五个风格各一套。lofi 的数值与两首现有曲子完全一致 ——
   breath.abc 不写任何覆盖行，就是这一套。 */
export const STYLES: Record<string, SongStyle> = {
  lofi: {
    inst: 'softPiano',
    comp: { type: 'arp8', inst: 'nylon', oct: 12, gain: 0.22 },
    pad: { gain: 0.042, rev: 0.55 },
    bass: { type: 'half', inst: 'bassLofi', gain: 0.42 },
    drums: { kit: 'lofi', kick: [0, 10], snare: [4, 12], hat: 'off', open: [] },
    mix: { cut: 3200, lead: 0.46, comp: 0.24, bass: 0.52, vol: 1 },
    tape: 0.13,
    swing: 0.012,
    echo: 0,
  },
  rock: {
    inst: 'egt',
    comp: { type: 'riff', inst: 'egt', oct: 0, gain: 0.22 },
    bass: { type: 'eighth', inst: 'ebass', gain: 0.8 },
    drums: { kit: 'acoustic', kick: [0, 6, 8], snare: [4, 12], hat: 'eighth', open: [] },
    mix: { cut: 6400, lead: 0.36, comp: 0.24, bass: 0.8, vol: 0.55 },
    tape: 0,
    swing: 0,
    echo: 0,
  },
  classic: {
    inst: 'violin',
    comp: { type: 'waltz', inst: 'piano', oct: 12, gain: 0.4 },
    bass: { type: 'waltz', inst: 'cello', gain: 0.58 },
    drums: { kit: 'acoustic', kick: [], snare: [], hat: 'none', open: [] },
    mix: { cut: 11000, lead: 0.46, comp: 0.4, bass: 0.58, vol: 1.5 },
    tape: 0,
    swing: 0,
    echo: 0,
  },
  cyber: {
    inst: 'pluck',
    comp: { type: 'stab', inst: 'epiano', oct: 12, gain: 0.34, pat: [2, 7, 10] },
    bass: { type: 'half', inst: 'sub', gain: 0.4 },
    drums: { kit: 'kpr77', kick: [0, 3, 8, 11], snare: [4, 12], hat: '16', open: [] },
    mix: { cut: 9000, lead: 0.44, comp: 0.34, bass: 0.4, vol: 0.86 },
    tape: 0,
    swing: 0,
    echo: 0.22,
  },
  pixel: {
    inst: 'chipLead',
    comp: { type: 'arp8', inst: 'chipLead', oct: 12, gain: 0.052 },
    bass: { type: 'eighth', inst: 'chipBass', gain: 0.22 },
    drums: { kit: 'chip', kick: [0, 6, 8], snare: [4, 12], hat: 'eighth', open: [] },
    mix: { cut: 8200, lead: 0.16, comp: 0.052, bass: 0.22, vol: 1.15 },
    tape: 0,
    swing: 0,
    echo: 0,
  },
};

const VOICES: readonly VoiceName[] = [
  'piano', 'epiano', 'softPiano', 'ebass', 'bassLofi', 'egt', 'nylon', 'violin', 'cello',
  'flute', 'bell', 'pluck', 'saw', 'pad', 'sub', 'chipLead', 'chipBass',
];
const COMPS: readonly CompType[] = ['pad', 'waltz', 'hold', 'stab', 'riff', 'pick', 'arp8', 'arp16'];
const BASSES: readonly BassSpec['type'][] = ['quarter', 'eighth', 'waltz', 'half', 'root5', 'riff', 'line'];
const HATS: readonly HatType[] = ['eighth', '16', 'off', 'none'];

const clone = (s: SongStyle): SongStyle => ({
  inst: s.inst,
  comp: { ...s.comp },
  pad: s.pad ? { ...s.pad } : undefined,
  bass: { ...s.bass },
  drums: { ...s.drums, kick: [...s.drums.kick], snare: [...s.drums.snare], open: [...s.drums.open] },
  mix: { ...s.mix },
  tape: s.tape,
  swing: s.swing,
  echo: s.echo,
});

const num = (v: string | undefined): number | undefined => {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const nums = (v: string | undefined): number[] | undefined => {
  if (!v) return undefined;
  const out = v
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isFinite(x));
  return out.length ? out : [];
};

const voice = (v: string | undefined): VoiceName | undefined =>
  v && (VOICES as readonly string[]).includes(v) ? (v as VoiceName) : undefined;

/** 把一条 %%OB 指令应用到预设上。认不出的键只记警告，不抛错 —— 谱写错了不该让整首静音。 */
function apply(st: SongStyle, line: string, warnings: string[]): void {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return;
  const key = parts[0].toLowerCase();
  const pos: string[] = [];
  const args = new Map<string, string>();
  parts.slice(1).forEach((t) => {
    const eq = t.indexOf('=');
    if (eq > 0) args.set(t.slice(0, eq).toLowerCase(), t.slice(eq + 1));
    else pos.push(t);
  });

  const bad = (msg: string): void => {
    warnings.push(`%%OB ${line}：${msg}`);
  };

  switch (key) {
    case 'style':
      return; // 预扫描处理
    case 'inst': {
      const v = voice(pos[0]);
      if (v) st.inst = v;
      else bad(`音色 ${pos[0]} 不认识`);
      return;
    }
    case 'comp': {
      const type = pos[0] as CompType;
      if (COMPS.includes(type)) st.comp.type = type;
      else bad(`伴奏型 ${pos[0]} 不认识`);
      const inst = voice(pos[1]);
      if (inst) st.comp.inst = inst;
      const oct = num(args.get('oct'));
      if (oct != null) st.comp.oct = oct;
      const gain = num(args.get('gain'));
      if (gain != null) st.comp.gain = gain;
      const pat = nums(args.get('pat'));
      if (pat) st.comp.pat = pat;
      return;
    }
    case 'pad': {
      if (!st.pad) st.pad = { gain: 0.04, rev: 0.5 };
      const gain = num(args.get('gain')) ?? num(pos[0]);
      if (gain != null) st.pad.gain = gain;
      if (gain === 0) return;
      const rev = num(args.get('rev'));
      if (rev != null) st.pad.rev = rev;
      const voices = num(args.get('voices'));
      if (voices != null) st.pad.voices = voices;
      const oct = num(args.get('oct'));
      if (oct != null) st.pad.oct = oct;
      return;
    }
    case 'bass': {
      const type = pos[0] as BassSpec['type'];
      if (BASSES.includes(type)) st.bass.type = type;
      const inst = voice(pos[0]) || voice(pos[1]);
      if (inst) st.bass.inst = inst;
      const oct = num(args.get('oct'));
      if (oct != null) st.bass.oct = oct;
      const gain = num(args.get('gain'));
      if (gain != null) st.bass.gain = gain;
      return;
    }
    case 'drums': {
      const kit = args.get('kit') || pos[0];
      if (kit) st.drums.kit = kit;
      const kick = nums(args.get('kick'));
      if (kick) st.drums.kick = kick;
      const snare = nums(args.get('snare'));
      if (snare) st.drums.snare = snare;
      const open = nums(args.get('open'));
      if (open) st.drums.open = open;
      const hat = args.get('hat') as HatType | undefined;
      if (hat) {
        if (HATS.includes(hat)) st.drums.hat = hat;
        else bad(`踩镲型 ${hat} 不认识`);
      }
      return;
    }
    case 'mix': {
      const cut = num(args.get('cut'));
      if (cut != null) st.mix.cut = cut;
      const lead = num(args.get('lead'));
      if (lead != null) st.mix.lead = lead;
      const comp = num(args.get('comp'));
      if (comp != null) st.mix.comp = comp;
      const bass = num(args.get('bass'));
      if (bass != null) st.mix.bass = bass;
      const vol = num(args.get('vol'));
      if (vol != null) st.mix.vol = vol;
      return;
    }
    case 'tape':
    case 'swing':
    case 'echo': {
      const n = num(pos[0]) ?? num(args.get('v'));
      if (n == null) bad('缺少数值');
      else if (key === 'tape') st.tape = n;
      else if (key === 'swing') st.swing = n;
      else st.echo = n;
      return;
    }
    default:
      bad(`未知指令 ${key}`);
  }
}

/** 从 %%OB 指令解析出一套风格。没写 style 就用调用方给的场景兜底。 */
export function resolveStyle(directives: string[], fallback: string, warnings: string[]): SongStyle {
  let name = fallback;
  directives.forEach((d) => {
    const t = d.trim().split(/\s+/);
    if (t[0]?.toLowerCase() === 'style' && t[1]) name = t[1].toLowerCase();
  });

  const base = STYLES[name];
  if (!base) warnings.push(`未知风格 ${name}，按 lofi 处理`);

  const st = clone(base || STYLES.lofi);
  directives.forEach((d) => apply(st, d, warnings));
  return st;
}
