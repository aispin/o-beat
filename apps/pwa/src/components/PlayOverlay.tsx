import { Pause } from 'lucide-react';

import type { GameSnapshot } from '@/engine';
import { cn } from '@/lib/utils';

/* 演奏中的 UI 全部由快照驱动：
   分数、连击、速度读数都是引擎算好的，这里只负责把它们放到屏幕上。
   动画不用 JS 定时器 —— 给元素换 key 让它重新挂载，CSS 动画自然重放。 */
export function PlayOverlay({ snap, onPause }: { snap: GameSnapshot; onPause: () => void }) {
  const playing = snap.phase === 'playing' || snap.phase === 'paused';
  if (!playing) return null;

  return (
    <>
      <div
        className={cn(
          'pointer-events-none fixed left-5 top-[calc(env(safe-area-inset-top,0px)+14px)] z-10',
          snap.phase === 'paused' && 'opacity-40',
        )}
      >
        <b
          key={snap.score}
          className="combo-pop block text-[26px] font-bold leading-none tabular-nums"
        >
          {snap.score}
        </b>
        <span className="mt-1 block text-[9px] font-semibold tracking-[2.6px] text-muted-foreground">
          SCORE
        </span>
        {snap.hudBpm ? (
          <span
            key={snap.bpmSeq}
            className="bpm-pulse mt-1 block text-[9.5px] font-bold tracking-[1.1px] tabular-nums text-brand"
          >
            {snap.hudBpm}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onPause}
        aria-label="暂停"
        className="glass fixed right-4 top-[calc(env(safe-area-inset-top,0px)+14px)] z-10 grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
      >
        <Pause className="size-4" />
      </button>

      {snap.combo >= 2 ? (
        <div
          key={snap.comboSeq}
          className="combo-pop pointer-events-none fixed left-1/2 top-[26%] z-10 -translate-x-1/2 text-center"
        >
          <b className="block text-[42px] font-bold leading-none tabular-nums text-brand drop-shadow-[0_4px_18px_var(--accent-glow)]">
            {snap.combo}
          </b>
          <span className="mt-1 block text-[9px] font-semibold tracking-[3px] text-muted-foreground">
            COMBO
          </span>
        </div>
      ) : null}

      {snap.countdown > 0 ? (
        <div
          key={snap.countdown}
          className="pointer-events-none fixed inset-0 z-[3] grid place-items-center"
        >
          <b className="countdown-num text-[92px] font-bold leading-none text-foreground/90">
            {snap.countdown}
          </b>
        </div>
      ) : null}

      <div key={snap.flashSeq} className="judge-flash judge-flash-on" aria-hidden />
    </>
  );
}
