import { useEffect } from 'react';

import { bgm, type GameSnapshot } from '@/engine';

/** BGM 只在「不在对局里」的时候响：首页、结算页。
 *  演奏中和暂停都停掉——暂停还留着伴奏，回来会接不上拍，反而像 bug。
 *
 *  曲子跟着当前曲目走：换曲目（或节奏模式里改风格 / 速度）会换一段编曲。
 *  `snap.song` 是引擎里的曲目对象本身，引用稳定，所以下面这个 effect
 *  只会在真的换歌时触发，不会每次 emit 都把音乐重排一遍。 */
export function useBgm(snap: GameSnapshot): void {
  const enabled = snap.settings.bgm;
  const idle = snap.phase === 'home' || snap.phase === 'result';
  const song = snap.song;

  useEffect(() => {
    bgm.setSong(song);
  }, [song]);

  useEffect(() => {
    if (!enabled || !idle) {
      bgm.stop();
      return;
    }
    /* 延迟 260ms 再起：用户的第一次点按多半就是「开始」，
       立刻起播会先响半个音再被掐掉。这个延迟跨过了那一下点击。 */
    const t = window.setTimeout(() => bgm.play(), 260);
    return () => {
      window.clearTimeout(t);
      bgm.stop();
    };
  }, [enabled, idle]);
}
