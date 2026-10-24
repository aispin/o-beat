/* 磁带底噪：嘶声 + 噼啪。
   ------------------------------------------------------------
   以前这条链是一条白噪过带通（"黑胶沙沙"），它只有"沙"，没有"噼"。
   真实的磁带/黑胶噪声是两种东西叠起来的：

   - **嘶声**：宽带白噪，但是被磁头缝隙和均衡砍过 —— 4 kHz 以上开始掉，
     300 Hz 以下也掉（不然会跟贝斯抢低频）。
   - **噼啪**：离散的脉冲。每一颗都是"噪声冲击 + 极短振铃"，
     间隔不均匀、大小差好几个数量级（多数很小，偶尔明显）。

   所以这条 buffer 是**离线预渲染**的：启动时算一次，运行时就是一个
   循环的 BufferSource。不要在每个循环里现算 —— 噼啪的重心在 microseconds，
   用调度器逐颗排会漏、会抖，还费 CPU。

   长度取 9.7 秒（质数秒级），循环两遍的间隔不会被人耳抓到节拍。
*/

/** 一次噼啪：极短振铃，两个泛音就够"脆"了 */
function pop(d: Float32Array, sr: number, at: number, amp: number, decay: number, freq: number): void {
  const n = Math.min(d.length - at, Math.ceil(decay * 6 * sr));
  if (n <= 0) return;
  const w = (2 * Math.PI * freq) / sr;
  const w2 = w * 2.71; // 非整数倍，避免听起来像"叮"
  for (let i = 0; i < n; i++) {
    const e = Math.exp(-i / (decay * sr));
    d[at + i] += amp * e * (Math.sin(w * i) * 0.8 + Math.sin(w2 * i) * 0.2);
  }
}

/** 磁带底噪的循环 buffer。峰值归一到 0.9，电平由 Score.tape 决定。 */
export function tapeLoop(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = 9.7;
  const len = Math.ceil(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);

  /* 1. 嘶声：两级一阶低通（≈4 kHz）+ 一阶高通（≈300 Hz）。
     两个系数都是"经验值"：再亮就是白噪，再暗就像雨声。 */
  let l1 = 0;
  let l2 = 0;
  let slow = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    l1 += (w - l1) * 0.42;
    l2 += (l1 - l2) * 0.42;
    slow += (l2 - slow) * 0.0021; // 极慢的一阶，当作直流/低频轰鸣
    d[i] = (l2 - slow) * 0.05;
  }

  /* 2. 噼啪：数量与时长成正比，大小按幂律分布 —— 多数听不见，少数"啪"一下。
     平铺的均匀分布听着像电子噪声，不像磁带。 */
  const hits = Math.round(dur * 7.5);
  for (let k = 0; k < hits; k++) {
    const at = Math.floor(Math.random() * (len - sr * 0.05));
    const amp = Math.pow(Math.random(), 2.4) * 0.62;
    const decay = 0.0016 + Math.random() * 0.0062;
    const freq = 1100 + Math.random() * 3100;
    pop(d, sr, at, amp, decay, freq);
  }

  // 3. 偶尔一颗"划痕"：比普通噼啪长 5–10 倍，低频也低一档
  for (let k = 0; k < 3; k++) {
    const at = Math.floor(Math.random() * (len - sr * 0.1));
    pop(d, sr, at, 0.5 + Math.random() * 0.2, 0.02 + Math.random() * 0.022, 600 + Math.random() * 900);
  }

  // 4. 峰值归一：电平只由 Score.tape 一个旋钮决定，buffer 本身不自带增益
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0) {
    const g = 0.9 / peak;
    for (let i = 0; i < len; i++) d[i] *= g;
  }
  return buf;
}
