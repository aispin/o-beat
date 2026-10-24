/* BGM 模块入口。
   拆开的理由：采样、音色、编曲、排程、时钟各自独立，
   改一首曲子只需要碰 compose.ts，不用在七百行里翻。 */
import { createBgm } from './engine';
import type { BgmApi } from './engine';

export const bgm: BgmApi = createBgm();

declare global {
  interface Window {
    /* game.js / backing.js 是还没迁到 TS 的引擎文件，通过全局拿编曲数据 */
    BGM?: BgmApi;
  }
}

if (typeof window !== 'undefined') window.BGM = bgm;
