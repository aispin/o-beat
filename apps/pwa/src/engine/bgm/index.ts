/* BGM 模块入口。
   拆开的理由：采样、音色、编曲、排程、时钟各自独立，
   改一首曲子只需要碰 compose.ts，不用在七百行里翻。 */
import { createBgm } from './engine';
import type { BgmApi } from './engine';

export const bgm: BgmApi = createBgm();

declare global {
  interface Window {
    /* 调试用：控制台里 window.BGM.scoreOf(S.song) 能直接看编曲数据。
       引擎内部一律走 import，不读这个全局。 */
    BGM?: BgmApi;
  }
}

if (typeof window !== 'undefined') window.BGM = bgm;
