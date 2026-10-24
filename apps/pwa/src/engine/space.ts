/* 混响：一条算出来的 IR。
   ------------------------------------------------------------
   不用 ConvolverNode 的现成 IR 文件，也不用算法混响的 comb/allpass 并联：
   前者要资源、后者在这个音量下听不出差别。这里直接算一条"小房间"的
   冲激响应 —— 两声道各自独立的噪声，指数衰减，高频比低频衰减快。

   lofi 的混响要"短、暗、湿"三者同时成立：
   - 短（1.5–2 s）：是屋子，不是教堂。
   - 暗（尾巴越来越闷）：高频先被空气和墙面吸掉。
   - 湿：干净的房间反而不 lofi，需要有可听的"糊"。

   阻尼用一个时间变化的单极点低通实现 —— 越往后系数越小，尾巴就越暗。
*/

export interface RoomOpt {
  /** 尾巴长度（秒） */
  dur?: number;
  /** 衰减指数，越大越快 */
  decay?: number;
  /** 起头亮度 0..1 */
  bright?: number;
  /** 预延迟（秒） */
  pre?: number;
}

export function roomIR(ctx: BaseAudioContext, o?: RoomOpt): AudioBuffer {
  const dur = (o && o.dur) || 1.9;
  const decay = (o && o.decay) || 2.7;
  const bright = (o && o.bright) || 0.72;
  const pre = Math.round(((o && o.pre) || 0.016) * ctx.sampleRate);
  const len = Math.ceil(dur * ctx.sampleRate);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let z = 0;
    for (let i = pre; i < len; i++) {
      const p = (i - pre) / (len - pre);
      // 起头亮、尾巴暗：单极点低通的系数随时间线性收窄
      const a = 0.06 + bright * 0.84 * (1 - p) * (1 - p);
      z += (Math.random() * 2 - 1 - z) * a;
      d[i] = z * Math.pow(1 - p, decay);
    }
    // 预延迟段补一点极轻的直达声散射，避免"前 16 ms 全黑"
    for (let i = 0; i < pre; i++) d[i] *= 0.02;
  }
  return buf;
}
