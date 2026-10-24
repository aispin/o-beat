/* ABC 引擎自检：解析器的边界 + 两首谱落格后的结果 + 换风格。
   跑法：pnpm --filter @o-beat/pwa abc:check

   为什么用 vite 的 ssrLoadModule 而不是 node 直接跑：引擎是 TS、无扩展名 import，
   node 的类型剥离处理不了路径解析。借 vite 的转换只要一行，也不用装 vitest。 */
import { createServer } from 'vite';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
});

const { parseAbc, scoreFromAbc, ABC_SONGS } = await server.ssrLoadModule('/src/engine/abc/index.ts');

let fails = 0;
function eq(name, got, want) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    console.log(`  ok   ${name}`);
  } else {
    fails++;
    console.log(`  FAIL ${name}\n       实际 ${a}\n       期望 ${b}`);
  }
}

/** 把 bars × steps 的格子压成 '格:音高' 的数组，只留非空 */
const digest = (grid) =>
  (grid || []).map((row) =>
    (row || []).flatMap((v, i) => (v == null ? [] : [`${i}:${v}`])),
  );

/** 时值格子是 0 填充的，只留非零 */
const digestDur = (grid) =>
  (grid || []).map((row) =>
    (row || []).flatMap((v, i) => (!v ? [] : [`${i}:${v}`])),
  );

const midis = (tune, voice = 0) => tune.voices[voice].events.map((e) => e.midi);
const durs = (tune, voice = 0) => tune.voices[voice].events.map((e) => e.dur);

console.log('\n解析器');
{
  const t = parseAbc('X:1\nM:4/4\nL:1/4\nK:C\nC D E F | c d e f | C, D, E, F, |');
  eq('八度：C=c4 / c=c5 / C,=c3', midis(t), [60, 62, 64, 65, 72, 74, 76, 77, 48, 50, 52, 53]);
  eq('小节数', t.bars, 3);
}

{
  const t = parseAbc('X:1\nM:4/4\nL:1/4\nK:D\nF F | =F F | F F |');
  eq('调号 F# + 本小节还原', midis(t), [66, 66, 65, 65, 66, 66]);
}

{
  const t = parseAbc('X:1\nM:4/4\nL:1/16\nK:C\nc4 d2 e8 | c2/3');
  eq('时值 4 / 2 / 8', durs(t).slice(0, 3), [4, 2, 8]);
  eq('三连音取整并警告', [durs(t)[3], t.warnings.length > 0], [1, true]);
}

{
  const t = parseAbc('X:1\nM:4/4\nL:1/16\nK:C\nc4-c4 | c2');
  eq('连音线合并成一个长音', durs(t), [8, 2]);
}

{
  const t = parseAbc('X:1\nM:4/4\nL:1/16\nK:C\n|: c4 d4 :| e4');
  eq('反复展开', midis(t), [72, 74, 72, 74, 76]);
  eq('反复后的小节数', t.bars, 3);
}

{
  const t = parseAbc('X:1\nM:4/4\nL:1/16\nK:C\n[CEG]4 c4 |');
  eq('和弦三个音同一格', t.voices[0].events.map((e) => [e.step, e.midi]), [[0, 60], [0, 64], [0, 67], [4, 72]]);
}

{
  const t = parseAbc('X:1\nM:4/4\nL:1/16\nK:Am\n"Am" c4 z4 | "F" a4 z4 |\nV:2 name="bass"\nA,,8 z8 | z8 F,,8 |');
  eq('和弦记号落到格上', t.chords.map((c) => [c.step, c.name]), [[0, 'Am'], [16, 'F']]);
  eq('两个声部', t.voices.map((v) => v.name), ['lead', 'bass']);
}

console.log('\n两首谱的落格');
{
  const sc = scoreFromAbc(ABC_SONGS.breath, { id: 'breath', bpm: 64, meter: 4, scene: 'lofi' });
  eq('长呼吸 · 旋律', digest(sc.lead), [
    ['0:72', '6:76', '8:79'],
    ['4:72'],
    ['0:77', '6:81', '8:79'],
    ['4:79'],
    ['0:76', '6:79', '8:76', '12:74'],
    ['4:72'],
    ['0:74', '6:71', '8:74'],
    ['4:79'],
  ]);
  eq('长呼吸 · 低音', digest(sc.bass.line), [
    ['0:45'], ['8:43'], ['0:41'], ['8:45'], ['0:36', '6:43'], ['12:38'], ['0:43'], ['8:40'],
  ]);
  eq('长呼吸 · 每小节和弦根音', sc.prog.map((i) => sc.chords[i].root), [45, 45, 41, 41, 36, 36, 43, 43]);
  eq('长呼吸 · 速度/拍号/小节', [sc.bpm, sc.meter, sc.bars, sc.steps], [64, 4, 8, 16]);
  eq('长呼吸 · 风格', [sc.inst, sc.comp.type, sc.comp.inst, sc.pad?.gain, sc.mix.cut, sc.tape, sc.swing], [
    'softPiano', 'arp8', 'nylon', 0.042, 3200, 0.13, 0.012,
  ]);
  eq('长呼吸 · 鼓', [sc.drums.kit, sc.drums.kick, sc.drums.snare, sc.drums.hat], [
    'lofi', [0, 10], [4, 12], 'off',
  ]);
  eq('长呼吸 · 旋律时值', digestDur(sc.leadDur)[0], ['0:4', '6:2', '8:8']);
}

{
  const sc = scoreFromAbc(ABC_SONGS.rain, { id: 'rain', bpm: 68, meter: 4, scene: 'lofi' });
  eq('雨窗 · 旋律', digest(sc.lead), [
    ['0:74', '2:76', '4:78', '8:81', '12:78'],
    ['2:76', '4:74'],
    ['0:74', '4:79', '6:81', '8:79', '12:74'],
    ['4:79'],
    ['0:76', '4:81', '6:83', '8:81', '12:76'],
    ['4:76'],
    ['0:78', '4:81', '8:86', '12:81'],
    ['4:78'],
  ]);
  eq('雨窗 · 低音', digest(sc.bass.line), [
    ['0:38'], ['8:42'], ['0:43'], ['8:47'], ['0:45'], ['8:49'], ['0:38'], ['8:42'],
  ]);
  eq('雨窗 · 每小节和弦根音', sc.prog.map((i) => sc.chords[i].root), [38, 38, 43, 43, 45, 45, 38, 38]);
  eq('雨窗 · 覆盖项', [sc.comp.type, sc.comp.gain, sc.pad.gain, sc.pad.rev, sc.mix.cut, sc.mix.lead, sc.tape, sc.swing], [
    'pick', 0.3, 0.036, 0.5, 8000, 0.4, 0.1, 0,
  ]);
  eq('雨窗 · 鼓与贝斯增益', [sc.drums.kick, sc.drums.hat, sc.bass.gain], [[0, 8], 'none', 0.38]);
}

{
  const rock = ABC_SONGS.breath.replace('%%OB style lofi', '%%OB style rock');
  const sc = scoreFromAbc(rock, { id: 'breath', bpm: 64, meter: 4, scene: 'lofi' });
  eq('同一份谱换摇滚', [sc.inst, sc.comp.type, sc.drums.kit, sc.mix.cut, sc.pad, sc.tape, sc.swing], [
    'egt', 'riff', 'acoustic', 6400, undefined, 0, 0,
  ]);
  eq('换风格不改音符', digest(sc.lead)[0], ['0:72', '6:76', '8:79']);
}

const warnings = [
  ...parseAbc(ABC_SONGS.breath).warnings,
  ...parseAbc(ABC_SONGS.rain).warnings,
];
console.log(`\n两首谱的解析警告：${warnings.length ? warnings.join('；') : '无'}`);
console.log(fails ? `\n${fails} 项不通过` : '\n全部通过');

await server.close();
process.exit(fails ? 1 : 0);
