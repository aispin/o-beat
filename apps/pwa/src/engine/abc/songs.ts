/* 曲库的谱：一个 .abc 就是一首曲子。
   新增一首 = 放一个 .abc 进来 + 在下面登记一行；不需要改引擎、也不需要写 TS 数据。 */
import breath from '../../songs/breath.abc?raw';
import rain from '../../songs/rain.abc?raw';

/** 曲目 id → ABC 原文。id 与 game.ts 的 SONGS 对齐。 */
export const ABC_SONGS: Record<string, string> = {
  breath,
  rain,
};
