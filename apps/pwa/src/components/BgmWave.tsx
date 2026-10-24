import { useEffect, useRef } from 'react';

import { bgm } from '@/engine';

/** 开始按钮里的那条波形。
 *
 *  直接读 BGM 的时域数据画，所以它跳的节奏就是当前这首曲子的鼓点——
 *  换曲目会跟着换，关掉背景音乐就退回一条慢慢呼吸的平线。
 *
 *  为什么用 canvas 而不是几十个 div：这是 30fps 的逐帧动画，
 *  走 React 的话每帧都要 reconcile 一遍，白白挤掉游戏画布的时间。
 *  组件本身不接收任何 props，也就永远不会因为父组件重渲染而重跑 effect。 */
export function BgmWave() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const c = cv?.getContext('2d');
    if (!cv || !c) return;

    const data = new Float32Array(1024);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let raf = 0;

    const draw = (now: number) => {
      if (!reduce) raf = requestAnimationFrame(draw);

      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (!w || !h) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);

      const live = bgm.waveform(data);
      const bars = Math.max(8, Math.round(w / 5));
      const seg = Math.max(1, Math.floor(data.length / bars));
      const bw = w / bars;
      const mid = h / 2;
      const reach = h * 0.58;

      // 深色低透明度：压在品牌渐变上，既看得见又不跟按钮文字抢
      c.fillStyle = 'rgba(6, 16, 14, 0.34)';

      for (let i = 0; i < bars; i++) {
        let amp = 0;
        if (live) {
          let peak = 0;
          for (let j = 0; j < seg; j++) {
            const v = Math.abs(data[i * seg + j] || 0);
            if (v > peak) peak = v;
          }
          amp = Math.min(1, peak * 3.6);
        } else {
          // 没在响：一条缓呼吸的平线，别让按钮看着像坏了
          const p = i / bars;
          amp = reduce ? 0.12 : 0.055 + 0.045 * Math.sin(now / 640 + p * 7);
        }
        const bh = Math.max(1.5, amp * reach);
        c.fillRect(i * bw + bw * 0.3, mid - bh / 2, Math.max(1, bw * 0.4), bh);
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
