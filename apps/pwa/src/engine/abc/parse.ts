/* ABC 乐谱解析（子集）—— 目标不是"完美支持 ABC"，而是"能被引擎演奏"。
   所以只认演奏需要的东西：音高、时值、小节、和弦记号、声部；
   排版类的指令（%%score / 装饰 / 跳房子 / 不等分音符）一律跳过并记一条警告。

   为什么自己写而不用 abcjs：见 docs/adr/0003-abc-score-engine.md。
   一句话 —— abcjs 的 abcjs-basic-min.js 是 500 KiB，我们整个 PWA 预缓存才 612 KiB；
   而且它给的是"排版用 AST"（pitch 是音级、临时记号是独立元素），播放还得再转一次。 */

export interface AbcNote {
  /** 第几小节（0 起） */
  bar: number;
  /** 小节内第几个十六分位 */
  step: number;
  /** 时值：几个十六分位。连音线会合并成一个长音，所以可能超过一小节 */
  dur: number;
  midi: number;
}

export interface AbcVoice {
  id: string;
  /** 声部名：lead / bass / comp / drums，决定它去引擎的哪一层 */
  name: string;
  events: AbcNote[];
  bars: number;
}

export interface AbcChordMark {
  /** 绝对格号：bar × steps + step */
  step: number;
  name: string;
}

export interface AbcTune {
  id: string;
  title: string;
  /** Q: 的速度 */
  bpm: number;
  /** 每小节几拍（只支持 3、4） */
  meter: number;
  key: string;
  /** 每小节几个十六分位 */
  steps: number;
  bars: number;
  voices: AbcVoice[];
  chords: AbcChordMark[];
  /** %%OB 指令的原文（去掉前缀），交给 style.ts 解释 */
  directives: string[];
  warnings: string[];
}

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** 十二个主音各自的大调调号（负数是降号数）。用半音下标，省掉 15 个键名的表 */
const MAJOR_SIG = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];

/** 调式 → 相对同名大调的偏移（用来找"平行大调的调号"） */
const MODE_SHIFT: Record<string, number> = {
  maj: 0, major: 0, ion: 0, ionian: 0,
  dor: 2, dorian: 2,
  phr: 4, phrygian: 4,
  lyd: 5, lydian: 5,
  mix: 7, mixolydian: 7,
  m: 9, min: 9, minor: 9, aeo: 9, aeolian: 9,
  loc: 11, locrian: 11,
};

/** K: 行 → 每个音名的升降（0 / ±1）。Key signature 是"默认值"，临时记号是"本小节覆盖"。 */
function keyAlter(key: string): Map<string, number> {
  const out = new Map<string, number>();
  const m = /^\s*([A-G])([#b]?)([a-zA-Z]*)/.exec(key);
  if (!m) return out;
  const root = (SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const shift = MODE_SHIFT[(m[3] || 'maj').toLowerCase()];
  if (shift == null) return out; // 五声 / 未知调式：不设调号，按 C 处理
  const parent = ((root - shift) % 12 + 12) % 12;
  const sig = MAJOR_SIG[parent];
  const list = sig >= 0 ? SHARP_ORDER.slice(0, sig) : FLAT_ORDER.slice(0, -sig);
  const val = sig >= 0 ? 1 : -1;
  list.forEach((l) => out.set(l, val));
  return out;
}

interface VoiceState {
  id: string;
  name: string;
  events: AbcNote[];
  /** 当前小节 */
  bar: number;
  /** 当前小节内已用掉的格数 */
  pos: number;
  /** 本小节的临时记号：'F4' → -1。碰到小节线清空 */
  accid: Map<string, number>;
  /** 等着被续上的音（上一个音带了 '-'） */
  tie: AbcNote | null;
  /** 还没落地的和弦记号 */
  pending: string | null;
  /** 反复段从哪一小节开始 */
  repeatFrom: number | null;
  /** 解析完才知道：这个小节一共几小节 */
  bars: number;
}

interface Ctx {
  steps: number;
  /** L: 的默认时值，单位是"全音符的几分之一" */
  defLen: number;
  keyMap: Map<string, number>;
  chords: AbcChordMark[];
  warnings: string[];
  voice: VoiceState;
}

function warn(ctx: Ctx, ln: number, msg: string): void {
  const tag = `第 ${ln} 行`;
  if (!ctx.warnings.includes(`${tag}：${msg}`)) ctx.warnings.push(`${tag}：${msg}`);
}

/** 时值倍数：数字 / n / n/m / // */
function readLen(s: string, i: number): { len: number; next: number } {
  let j = i;
  let num = 0;
  let hasNum = false;
  let den = 0;
  let hasDen = false;

  while (j < s.length && s[j] >= '0' && s[j] <= '9') {
    num = num * 10 + (s.charCodeAt(j) - 48);
    hasNum = true;
    j++;
  }
  if (s[j] === '/') {
    j++;
    if (s[j] === '/') {
      den = 4;
      j++;
    } else {
      let d = 0;
      let has = false;
      while (j < s.length && s[j] >= '0' && s[j] <= '9') {
        d = d * 10 + (s.charCodeAt(j) - 48);
        has = true;
        j++;
      }
      den = has ? d : 2;
    }
    hasDen = true;
  }
  if (!hasNum && !hasDen) return { len: 1, next: i };
  return { len: hasNum && hasDen ? num / den : hasNum ? num : 1 / den, next: j };
}

/** 时值 → 十六分格数。不在格上的取整并警告（三连音会被压平）。 */
function stepsOf(len: number, ctx: Ctx, ln: number): number {
  const exact = len * ctx.defLen * 16;
  const n = Math.round(exact);
  if (Math.abs(exact - n) > 0.001) warn(ctx, ln, `时值 ${exact.toFixed(3)} 格不在十六分格上，已取整为 ${n}`);
  return n;
}

/** 读一个音（含升降号与八度），不读时值 */
function readNote(
  s: string,
  i: number,
  keyMap: Map<string, number>,
  accid: Map<string, number>,
): { midi: number; next: number } | null {
  let j = i;
  let acc = 0;
  let explicit = false;
  while (s[j] === '^' || s[j] === '_' || s[j] === '=') {
    if (s[j] === '^') acc += 1;
    else if (s[j] === '_') acc -= 1;
    else acc = 0;
    explicit = true;
    j++;
  }
  const letter = s[j];
  if (!letter || !/[A-Ga-g]/.test(letter)) return null;
  j++;

  /* ABC 的八度：C = 中央 C（C4），c = 高一个八度，c' 再高，C, 低一个 */
  let oct = letter === letter.toUpperCase() ? 0 : 1;
  while (s[j] === "'") {
    oct++;
    j++;
  }
  while (s[j] === ',') {
    oct--;
    j++;
  }

  const name = letter.toUpperCase();
  const remember = `${name}${oct + 1}`;
  const fallback = keyMap.get(name) || 0;
  let alter = fallback;
  if (explicit) {
    alter = acc;
    accid.set(remember, acc);
  } else if (accid.has(remember)) {
    alter = accid.get(remember) as number;
  }

  return { midi: 60 + 12 * oct + SEMI[name] + alter, next: j };
}

/** 把和弦记号落到位：一个记号只落在它后面第一个事件上 */
function takeChord(ctx: Ctx, abs: number): void {
  const st = ctx.voice;
  if (!st.pending) return;
  ctx.chords.push({ step: abs, name: st.pending });
  st.pending = null;
}

function emit(ctx: Ctx, midi: number, dur: number, tied: boolean, ln: number, advance = true): void {
  const st = ctx.voice;
  if (dur <= 0) {
    warn(ctx, ln, '时值为 0，已忽略');
    return;
  }
  const abs = st.bar * ctx.steps + st.pos;
  takeChord(ctx, abs);

  const prev = st.tie;
  let note: AbcNote;
  if (prev && prev.midi === midi && prev.bar * ctx.steps + prev.step + prev.dur === abs) {
    // 连音线：同一个音接上，变成长音
    prev.dur += dur;
    note = prev;
  } else {
    note = { bar: st.bar, step: st.pos, dur, midi };
    st.events.push(note);
  }
  st.tie = tied ? note : null;

  if (!advance) return;
  st.pos += dur;
  if (st.pos > ctx.steps) {
    warn(ctx, ln, `第 ${st.bar + 1} 小节超出 ${ctx.steps} 格，多出的部分被截掉`);
    st.pos = ctx.steps;
  }
}

/** 小节线的几种写法：| || |] [| |: :| :: :|: */
function barFlags(s: string, i: number): { next: number; start: boolean; end: boolean } | null {
  const c = s[i];
  const two = s.slice(i, i + 2);
  const three = s.slice(i, i + 3);
  if (three === ':|:') return { next: i + 3, start: true, end: true };
  if (two === '|:' || two === '::') return { next: i + 2, start: true, end: two === '::' };
  if (two === ':|') return { next: i + 2, start: false, end: true };
  if (two === '[|' || two === '|]') return { next: i + 2, start: false, end: false };
  if (c === '|' || c === ']' || c === ':') return { next: i + 1, start: false, end: c === ':' };
  return null;
}

function newBar(st: VoiceState, ctx: Ctx, f: { start: boolean; end: boolean }, ln: number): void {
  /* 「|:」只是反复标记，不是小节线。它出现在谱首或紧跟小节线时
     （此时 pos 已经是 0）不能多吃掉一小节，否则整首会多一格。 */
  if (f.start && !f.end && st.pos === 0) {
    st.repeatFrom = st.bar;
    return;
  }

  if (f.end) {
    /* 反复：把 [repeatFrom, 当前小节] 整段复制到后面。
       只支持整小节反复 —— 半小节反复会把拍子算错，不如不做。 */
    const from = st.repeatFrom ?? 0;
    const len = st.bar - from + 1;
    if (len > 0 && len < 256) {
      const add = st.events
        .filter((e) => e.bar >= from && e.bar <= st.bar)
        .map((e) => ({ bar: e.bar + len, step: e.step, dur: e.dur, midi: e.midi }));
      if (add.length) st.events.push(...add);
      st.bar += len;
    } else {
      warn(ctx, ln, '反复段长度为 0，已忽略');
    }
  }

  if (st.pos !== 0 && st.pos !== ctx.steps) {
    warn(ctx, ln, `第 ${st.bar + 1} 小节只有 ${st.pos}/${ctx.steps} 格`);
  }
  st.bar++;
  st.pos = 0;
  st.accid.clear();
  st.tie = null;
  if (f.start) st.repeatFrom = st.bar;
}

function parseMusic(line: string, ln: number, ctx: Ctx): void {
  let i = 0;
  const s = line;

  while (i < s.length) {
    const c = s[i];
    if (c === '%') return;
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }

    // "Am" 和弦记号
    if (c === '"') {
      const end = s.indexOf('"', i + 1);
      if (end < 0) {
        warn(ctx, ln, '和弦记号缺右引号');
        return;
      }
      const name = s.slice(i + 1, end).trim();
      if (name && name !== 'N.C.' && name !== 'NC') ctx.voice.pending = name;
      i = end + 1;
      continue;
    }

    if (c === '|' || c === ':' || c === ']' || c === '[') {
      const f = barFlags(s, i);
      if (f) {
        newBar(ctx.voice, ctx, f, ln);
        i = f.next;
        continue;
      }
    }

    // !accent! / +accent+ 装饰
    if (c === '!' || c === '+') {
      const k = s.indexOf(c, i + 1);
      i = k < 0 ? s.length : k + 1;
      continue;
    }

    // {g}A 倚音：装饰，不占时值
    if (c === '{') {
      const k = s.indexOf('}', i);
      i = k < 0 ? s.length : k + 1;
      continue;
    }

    if (c === '[') {
      // [1 / [2 跳房子
      if (/^\[[0-9]/.test(s.slice(i, i + 2))) {
        warn(ctx, ln, '跳房子 [1 / [2 暂不支持，已按顺奏展开');
        i++;
        while (i < s.length && /[0-9-]/.test(s[i])) i++;
        continue;
      }
      const end = s.indexOf(']', i);
      if (end < 0) {
        warn(ctx, ln, '和弦缺右括号');
        return;
      }
      const inner = s.slice(i + 1, end);
      const { len, next } = readLen(s, end + 1);
      const dur = stepsOf(len, ctx, ln);
      const ms: number[] = [];
      let k = 0;
      while (k < inner.length) {
        const n = readNote(inner, k, ctx.keyMap, ctx.voice.accid);
        if (!n) {
          k++;
          continue;
        }
        ms.push(n.midi);
        k = n.next;
      }
      if (!ms.length) warn(ctx, ln, '和弦里没有音');
      // 同一时刻的几个音：只有最后一个推进格子，否则位置会走三遍
      ms.forEach((m, i) => emit(ctx, m, dur, false, ln, i === ms.length - 1));
      i = next;
      continue;
    }

    const n = readNote(s, i, ctx.keyMap, ctx.voice.accid);
    if (n) {
      const { len, next } = readLen(s, n.next);
      let j = next;
      let tied = false;
      while (s[j] === '-') {
        tied = true;
        j++;
      }
      emit(ctx, n.midi, stepsOf(len, ctx, ln), tied, ln);
      i = j;
      continue;
    }

    if (c === 'z' || c === 'x' || c === 'Z') {
      let dur: number;
      if (c === 'Z') {
        dur = ctx.steps;
        i++;
      } else {
        const { len, next } = readLen(s, i + 1);
        dur = stepsOf(len, ctx, ln);
        i = next;
      }
      const st = ctx.voice;
      takeChord(ctx, st.bar * ctx.steps + st.pos);
      st.tie = null;
      st.pos += dur;
      if (st.pos > ctx.steps) {
        warn(ctx, ln, `第 ${st.bar + 1} 小节超出 ${ctx.steps} 格`);
        st.pos = ctx.steps;
      }
      continue;
    }

    if (c === '>' || c === '<') {
      warn(ctx, ln, '不等分音符 > / < 暂不支持，已按正常时值处理');
      i++;
      continue;
    }

    // 其它字符（内联字段、控制符）跳过
    i++;
  }
}

export function parseAbc(text: string): AbcTune {
  const warnings: string[] = [];
  const directives: string[] = [];
  const chords: AbcChordMark[] = [];
  const byId = new Map<string, VoiceState>();
  const voices: VoiceState[] = [];

  let id = '';
  let title = '';
  let bpm = 96;
  let meter = 4;
  let key = 'C';
  let defLen = 1 / 8;

  const makeVoice = (vid: string, name?: string): VoiceState => {
    const st: VoiceState = {
      id: vid,
      name: name || vid,
      events: [],
      bar: 0,
      pos: 0,
      accid: new Map(),
      tie: null,
      pending: null,
      repeatFrom: null,
      bars: 0,
    };
    byId.set(vid, st);
    voices.push(st);
    return st;
  };

  const ctx: Ctx = {
    steps: meter * 4,
    defLen,
    keyMap: keyAlter(key),
    chords,
    warnings,
    voice: makeVoice('1', 'lead'),
  };

  text.split(/\r?\n/).forEach((raw, idx) => {
    const ln = idx + 1;
    const line = raw.trim();
    if (!line) return;

    if (line.startsWith('%%')) {
      const body = line.slice(2).trim();
      const m = /^OB\b\s*(.*)$/i.exec(body);
      if (m && m[1]) directives.push(m[1]);
      return;
    }
    if (line.startsWith('%')) return;

    const h = /^([A-Za-z]):\s*(.*)$/.exec(line);
    if (h) {
      const f = h[1].toUpperCase();
      const v = h[2].trim();
      switch (f) {
        case 'X':
          id = v;
          break;
        case 'T':
          if (!title) title = v;
          break;
        case 'M': {
          const mm = /^(\d+)\/(\d+)$/.exec(v);
          if (mm) {
            const n = Number(mm[1]);
            if (n === 3 || n === 4) meter = n;
            else warn(ctx, ln, `拍号 ${v} 只支持 3/4 与 4/4，已按 4/4 处理`);
          } else if (/^C\|?$/.test(v)) {
            meter = 4;
          }
          ctx.steps = meter * 4;
          break;
        }
        case 'L': {
          const mm = /^(\d+)\/(\d+)$/.exec(v);
          if (mm) defLen = Number(mm[1]) / Number(mm[2]);
          else warn(ctx, ln, `默认时值 ${v} 认不出，保持原来的`);
          ctx.defLen = defLen;
          break;
        }
        case 'Q': {
          const eq = v.split('=').pop();
          const n = Number((eq || v).replace(/"/g, '').trim());
          if (Number.isFinite(n) && n > 0) bpm = n;
          else warn(ctx, ln, `速度 ${v} 认不出，保持 ${bpm}`);
          break;
        }
        case 'K':
          key = v || 'C';
          ctx.keyMap = keyAlter(key);
          break;
        case 'V': {
          const vm = /^(\S+)\s*(.*)$/.exec(v);
          const vid = (vm ? vm[1] : '1').replace(/[[\]]/g, '');
          const rest = vm ? vm[2] : '';
          const nm = /name\s*=\s*"([^"]*)"/.exec(rest) || /name\s*=\s*(\S+)/.exec(rest);
          const st = byId.get(vid) || makeVoice(vid, nm ? nm[1] : undefined);
          if (nm && nm[1]) st.name = nm[1];
          ctx.voice = st;
          break;
        }
        default:
          // C: / O: / R: / W: / w: 这些对演奏没用
          break;
      }
      return;
    }

    parseMusic(line, ln, ctx);
  });

  // 去掉开头自动建的那个空声部（有 V: 声明时它就不会被用到）
  const used = voices.filter((v) => v.events.length > 0 || byId.size === 1);
  const list = used.length ? used : voices.slice(0, 1);

  let bars = 1;
  list.forEach((v) => {
    v.bars = v.bar + (v.pos > 0 ? 1 : 0);
    bars = Math.max(bars, v.bars);
  });

  const uniq = new Map<string, AbcChordMark>();
  chords.forEach((c) => uniq.set(`${c.step}:${c.name}`, c));
  const marks = [...uniq.values()].sort((a, b) => a.step - b.step);

  return {
    id,
    title,
    bpm,
    meter,
    key,
    steps: meter * 4,
    bars,
    voices: list,
    chords: marks,
    directives,
    warnings,
  };
}
