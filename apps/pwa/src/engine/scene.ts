'use strict';

/* ============================================================
   O My Beat · 场景引擎
   全屏 GLSL 氛围层，5 套风格共用一套噪声/色调框架
   只用 WebGL1 语法（GLSL ES 1.00）—— 小程序 canvas 同样支持

   光照约定：所有场景的"近处/主体"在画面下方，向上退远
   ============================================================ */

/** 每帧送进 shader 的一组值，全部来自 game.ts 的时钟与判定 */
export interface SceneFrame {
  /** 秒，从开场算起 */
  t: number;
  /** 拍内进度 0..1 */
  beat: number;
  /** 小节序号 */
  bar: number;
  /** 拍点脉冲 0..1 */
  pulse: number;
  /** 命中能量 0..1 */
  energy: number;
  /** 色相偏移 0..1（0.5 为中性） */
  hue: number;
  /** 演奏压暗 0..1 */
  dim: number;
  /** 连击区间强度 0..1 */
  zone: number;
}

const VERT = [
  'attribute vec2 aPos;',
  'void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }',
].join('\n');

const HEAD = [
  'precision highp float;',
  'uniform vec2  uRes;',
  'uniform float uTime;',
  'uniform float uBeat;',
  'uniform float uBar;',
  'uniform float uPulse;',
  'uniform float uEnergy;',
  'uniform float uHue;',
  'uniform float uDim;',
  'uniform float uZone;',

  'float h21(vec2 p){',
  '  p = fract(p * vec2(127.1, 311.7));',
  '  p += dot(p, p + 34.56);',
  '  return fract(p.x * p.y);',
  '}',

  'float vnoise(vec2 p){',
  '  vec2 i = floor(p);',
  '  vec2 f = fract(p);',
  '  f = f * f * (3.0 - 2.0 * f);',
  '  float a = h21(i);',
  '  float b = h21(i + vec2(1.0, 0.0));',
  '  float c = h21(i + vec2(0.0, 1.0));',
  '  float d = h21(i + vec2(1.0, 1.0));',
  '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
  '}',

  'float fbm(vec2 p){',
  '  float v = 0.0;',
  '  float a = 0.5;',
  '  for (int i = 0; i < 4; i++) {',
  '    v += a * vnoise(p);',
  '    p = p * 2.03 + vec2(13.1, 7.7);',
  '    a *= 0.5;',
  '  }',
  '  return v;',
  '}',

  'vec3 hueShift(vec3 c, float a){',
  '  const vec3 k = vec3(0.57735);',
  '  float ca = cos(a);',
  '  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);',
  '}',
].join('\n');

const TAIL = [
  'void main(){',
  '  vec2 uv = gl_FragCoord.xy / uRes;',
  '  vec2 p  = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;',
  '  float t = uTime;',
  '  vec3 col = renderScene(uv, p, t);',

  '  col = hueShift(col, (uHue - 0.5) * 0.14);',

  // 连击 Zone：暖推
  '  col += vec3(0.10, 0.065, 0.015) * uZone;',

  // 游戏中压暗，保证音符可读
  '  col *= 1.0 - 0.28 * uDim;',

  // 暗角（非线性，四周塌得更快）
  '  vec2 q = uv - vec2(0.5, 0.54);',
  '  float vig = dot(q * vec2(1.05, 0.92), q * vec2(1.05, 0.92)) * (0.85 + uDim * 0.75);',
  '  col *= clamp(1.0 - vig * 2.1, 0.0, 1.0);',

  // 提对比：暗部压死、亮部保住
  '  col = pow(max(col, 0.0), vec3(1.05));',
  '  col = col / (1.0 + col * 0.18) * 1.05;',

  // 抖动去色带
  '  col += (h21(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * 0.012;',

  '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
  '}',
].join('\n');

/* ---------------- 电子 · 赛博朋克 ---------------- */
const CYBER = [
  'vec3 renderScene(vec2 uv, vec2 p, float t){',
  '  float hz = 0.40;',
  '  vec3 col = vec3(0.008, 0.003, 0.020);',

  // 夜空：顶部近黑，靠地平线泛紫
  '  float sky = smoothstep(hz, 0.98, uv.y);',
  '  col += vec3(0.13, 0.015, 0.22) * (1.0 - sky) * 0.55;',
  '  col += vec3(0.45, 0.03, 0.40) * exp(-abs(uv.y - hz) * 22.0) * 0.55;',

  // 城市剪影：高低错落
  '  float gx  = uv.x * 11.0;',
  '  float bid = floor(gx);',
  '  float r1  = h21(vec2(bid, 9.1));',
  '  float r2  = h21(vec2(bid, 2.3));',
  '  float bh  = 0.02 + r1 * r1 * 0.26 + 0.03 * r2;',
  '  float top = hz + bh;',
  '  float cityMask = step(uv.y, top) * step(hz - 0.002, uv.y);',
  '  col = mix(col, vec3(0.015, 0.005, 0.032), cityMask * 0.94);',

  // 窗户：稀疏、偏青紫
  '  vec2 wq = vec2(fract(gx) * 4.0, (uv.y - hz) * 30.0);',
  '  float lit = step(0.80, h21(floor(wq) + bid * 7.13));',
  '  float wmask = step(0.34, fract(wq.x)) * step(0.42, fract(wq.y)) * step(fract(wq.y), 0.92);',
  '  vec3 wcol = mix(vec3(0.45, 0.65, 1.0), vec3(1.0, 0.35, 0.75), h21(vec2(bid, 5.5)));',
  '  col += wcol * lit * wmask * cityMask * 0.75;',

  // 楼顶航空灯
  '  float beacon = step(0.86, h21(vec2(bid, 12.7))) * step(abs(uv.y - top - 0.008), 0.004) * step(h21(vec2(bid,1.1)), fract(t * 0.5));',
  '  col += vec3(1.0, 0.15, 0.25) * beacon * 0.9;',

  // 透视霓虹地面：近处亮、远处淡
  '  if (uv.y < hz) {',
  '    float d = hz - uv.y;',
  '    float near = smoothstep(0.0, hz * 0.92, d);',
  '    float z = 0.85 / (d + 0.012);',
  '    vec2 g = vec2((uv.x - 0.5) * z * 2.1, z * 1.05 + t * 1.15);',
  '    vec2 f = abs(fract(g) - 0.5);',
  '    float line = smoothstep(0.075, 0.0, min(f.x, f.y));',
  '    vec3 neon = mix(vec3(1.0, 0.08, 0.62), vec3(0.10, 0.92, 1.0), smoothstep(-0.14, 0.14, p.x));',
  '    float amp = 0.26 + near * 1.45;',
  '    float cut = mix(0.16, 1.0, smoothstep(0.15, 0.26, uv.y));',
  '    line *= smoothstep(0.0, 0.055, d);',
  '    col += neon * line * amp * cut * (0.40 + uPulse * 0.85 + uEnergy * 0.55);',
  '    col += neon * line * line * amp * cut * 0.60;',
  '    col += vec3(0.10, 0.008, 0.20) * near * 0.9 * cut;',
  // 地面横向流光
  '    float flow = exp(-abs(fract(g.y * 1.0) - 0.5) * 26.0) * near;',
  '    col += neon * flow * 0.12;',
  '  }',

  // 雨（只在上半，落地感）
  '  vec2 rq = vec2(uv.x * 90.0, (uv.y - t * 1.35) * 2.0);',
  '  float rain = step(0.991, h21(floor(rq))) * step(hz - 0.2, uv.y);',
  '  col += vec3(0.50, 0.78, 1.0) * rain * 0.30;',

  // 扫描线 + 轻微色散
  '  col *= 0.94 + 0.06 * sin(uv.y * 700.0 + t * 2.0);',
  '  col.r += 0.040 * sin(col.g * 9.0 + t * 1.7);',
  '  col.b -= 0.028 * sin(col.r * 7.0 + t);',

  // glitch 条带
  '  float gl = step(0.90, h21(vec2(floor(t * 6.0), 4.2)));',
  '  float band = step(0.74, h21(vec2(floor(uv.y * 26.0), floor(t * 6.0))));',
  '  col += vec3(0.80, 0.08, 0.55) * gl * band * 0.06;',

  '  return col;',
  '}',
].join('\n');

/* ---------------- 古典 · 音乐家的房间 ---------------- */
const CLASSIC = [
  'vec3 renderScene(vec2 uv, vec2 p, float t){',
  '  vec3 col = vec3(0.030, 0.019, 0.012);',

  // 墙：暗绿褐，带极淡的壁纸纹理
  '  float wall = 0.5 + 0.5 * sin(uv.x * 52.0) * sin(uv.y * 52.0);',
  '  col += vec3(0.045, 0.030, 0.014) * (wall - 0.5);',

  // 壁烛（左中）
  '  vec2 cp = vec2(0.20, 0.36);',
  '  float flick = 1.0 + 0.13 * sin(t * 8.3) + 0.07 * vnoise(vec2(t * 5.0, 1.7));',
  '  float g1 = exp(-length((uv - cp) * vec2(1.0, 1.30)) * 4.2) * flick;',
  '  col += vec3(1.0, 0.47, 0.14) * g1 * 0.95;',
  '  float halo = exp(-length((uv - cp) * vec2(1.0, 1.30)) * 1.5) * flick;',
  '  col += vec3(0.42, 0.20, 0.06) * halo * 0.40;',

  // 烛台剪影 + 火焰
  '  vec2 fl = (uv - vec2(0.20, 0.392)) * vec2(150.0, 48.0);',
  '  float flame = smoothstep(1.0, 0.0, length(vec2(fl.x * 0.72, fl.y - 1.1))) * flick;',
  '  col += vec3(1.0, 0.88, 0.60) * flame * 1.8;',
  '  float stick = step(abs(uv.x - 0.20), 0.012) * step(0.315, uv.y) * step(uv.y, 0.375);',
  '  col = mix(col, vec3(0.02, 0.012, 0.006), stick * 0.95);',
  '  float cup = step(length((uv - vec2(0.20, 0.315)) * vec2(26.0, 40.0)), 1.0);',
  '  col = mix(col, vec3(0.03, 0.018, 0.008), cup * 0.9);',

  // 月光窗（右上）：给房间一个硬的几何边界
  '  vec2 wc = vec2(0.81, 0.74);',
  '  vec2 wr = vec2(0.145, 0.165);',
  '  vec2 wq = (uv - wc) / wr;',
  '  float inW = step(abs(wq.x), 1.0) * step(abs(wq.y), 1.0);',
  '  vec3 moon = mix(vec3(0.030, 0.050, 0.098), vec3(0.14, 0.20, 0.34), smoothstep(-1.0, 1.0, wq.y));',
  '  moon += vec3(0.70, 0.82, 1.0) * exp(-length((uv - vec2(0.862, 0.862)) * 34.0));',
  '  moon += vec3(0.44, 0.58, 0.88) * exp(-length((uv - vec2(0.862, 0.862)) * 7.5)) * 0.45;',
  '  col = mix(col, moon, inW * 0.92);',
  '  float wf = max(smoothstep(0.012, 0.0, abs(abs(wq.x) - 1.0) * wr.x),',
  '                 smoothstep(0.012, 0.0, abs(abs(wq.y) - 1.0) * wr.y));',
  '  wf = max(wf, smoothstep(0.007, 0.0, abs(wq.x)) * step(abs(wq.y), 1.0));',
  '  wf = max(wf, smoothstep(0.007, 0.0, abs(wq.y)) * step(abs(wq.x), 1.0));',
  '  col = mix(col, vec3(0.028, 0.017, 0.010), wf * 0.92);',

  // 月光落在地板上的冷光斑
  '  float moonPool = exp(-length((uv - vec2(0.62, 0.22)) * vec2(1.1, 2.0)) * 3.0);',
  '  col += vec3(0.18, 0.26, 0.44) * moonPool * 0.30;',

  // 木地板：柔和过渡，不用硬边
  '  float d = 0.38 - uv.y;',
  '  float fl2 = smoothstep(-0.03, 0.09, d);',
  '  float dd = max(d, 0.001);',
  '  float z = 0.16 / (dd + 0.016);',
  '  float plank = fract((uv.x - 0.5) * z * 1.7);',
  '  float seam = smoothstep(0.030, 0.0, abs(plank - 0.5) - 0.47);',
  '  float grain = 0.5 + 0.5 * sin(z * 22.0 + plank * 14.0);',
  '  vec3 floorCol = vec3(0.16, 0.082, 0.036) * (0.30 + 0.90 * (1.0 - exp(-dd * 6.0))) * (0.65 + 0.35 * grain);',
  '  col = mix(col, floorCol, fl2 * 0.92);',
  '  col *= 1.0 - seam * fl2 * 0.55;',
  // 地板上的烛光反射（竖向拉长）
  '  float refl = exp(-length((uv - vec2(0.20, 0.18)) * vec2(1.3, 2.6)) * 3.0) * g1 * fl2;',
  '  col += vec3(1.0, 0.55, 0.20) * refl * 0.85;',

  // 飘尘
  '  for (int i = 0; i < 18; i++) {',
  '    float fi = float(i);',
  '    float sx = fract(h21(vec2(fi, 1.3)) + t * 0.010 * (0.3 + h21(vec2(fi, 5.1))));',
  '    float sy = fract(h21(vec2(fi, 8.7)) + t * 0.016);',
  '    float dd2 = length((uv - vec2(sx, sy)) * vec2(1.0, 1.30));',
  '    col += vec3(1.0, 0.76, 0.42) * smoothstep(0.007, 0.0, dd2) * 1.1;',
  '  }',

  '  return col;',
  '}',
].join('\n');

/* ---------------- Lofi · 慵懒房间 ---------------- */
const LOFI = [
  'vec3 renderScene(vec2 uv, vec2 p, float t){',

  // 室内基色：暖褐黑
  '  vec3 col = vec3(0.035, 0.026, 0.026);',
  '  col += vec3(0.24, 0.125, 0.045) * smoothstep(0.85, 0.05, uv.y) * 0.75;',

  // ---- 窗（右上）----
  '  vec2 wc = vec2(0.63, 0.72);',
  '  vec2 wr = vec2(0.29, 0.20);',
  '  vec2 wq = (uv - wc) / wr;',
  '  float inWin = step(abs(wq.x), 1.0) * step(abs(wq.y), 1.0);',

  // 窗外：雨夜城市
  '  vec3 sky = mix(vec3(0.10, 0.15, 0.25), vec3(0.26, 0.36, 0.50), clamp(wq.y * 0.5 + 0.5, 0.0, 1.0));',
  '  sky += vec3(0.50, 0.66, 0.90) * exp(-length((uv - vec2(0.74, 0.80)) * 5.0)) * 0.35;',
  // 远处楼群
  '  float bx = wq.x * 5.0;',
  '  float bTop = -0.25 + 0.42 * h21(vec2(floor(bx), 3.3));',
  '  sky = mix(sky, vec3(0.08, 0.11, 0.17), step(wq.y, bTop) * 0.85);',
  '  vec2 wq2 = vec2(fract(bx) * 3.0, wq.y * 24.0);',
  '  float wdens = 0.80 + 0.14 * h21(vec2(floor(bx), 8.2));',
  '  sky += vec3(1.0, 0.78, 0.42) * step(wdens, h21(floor(wq2) + floor(bx) * 3.1)) * step(0.45, fract(wq2.x)) * step(wq.y, bTop) * 0.30;',

  // 雨丝
  '  vec2 rq = vec2(uv.x * 150.0, (uv.y - t * 1.05) * 5.0);',
  '  sky += vec3(0.72, 0.86, 1.0) * step(0.976, h21(floor(rq))) * 0.30;',

  // 玻璃上的水珠（沿玻璃缓慢下滑）
  '  float drop = 0.0;',
  '  for (int i = 0; i < 12; i++) {',
  '    float fi = float(i);',
  '    float dx = h21(vec2(fi, 2.1)) - 0.5;',
  '    float dy = fract(h21(vec2(fi, 6.4)) - t * 0.028 * (0.35 + h21(vec2(fi, 4.4))));',
  '    vec2 qd = (uv - vec2(wc.x + dx * wr.x * 1.55, wc.y - wr.y + dy * wr.y * 2.0)) * vec2(46.0, 34.0);',
  '    drop += smoothstep(1.0, 0.0, length(qd));',
  '  }',
  '  sky += vec3(0.80, 0.90, 1.0) * drop * 0.16;',

  '  col = mix(col, sky, inWin * 0.94);',

  // 窗框（严格裁在窗内）
  '  float fX = smoothstep(0.014, 0.0, abs(abs(wq.x) - 1.0) * wr.x);',
  '  float fY = smoothstep(0.014, 0.0, abs(abs(wq.y) - 1.0) * wr.y);',
  '  float mull = smoothstep(0.008, 0.0, abs(wq.x)) * step(abs(wq.y), 1.0);',
  '  float frame = max(max(fX, fY), mull) * step(abs(wq.x), 1.06) * step(abs(wq.y), 1.06);',
  '  col = mix(col, vec3(0.10, 0.072, 0.062), clamp(frame, 0.0, 1.0) * 0.92);',

  // 窗口投到屋里的冷光柱（窄、只到桌面）
  '  float sx2 = (uv.x - wc.x) + (wc.y - uv.y) * 0.42;',
  '  float shaft = exp(-sx2 * sx2 * 90.0) * smoothstep(wc.y, wc.y - 0.42, uv.y) * smoothstep(0.10, 0.34, uv.y);',
  '  col += vec3(0.26, 0.38, 0.60) * shaft * 0.10;',

  // 台灯（右下）
  '  vec2 lp = vec2(0.84, 0.19);',
  '  float lamp = exp(-length((uv - lp) * vec2(1.0, 1.15)) * 4.6);',
  '  col += vec3(1.0, 0.62, 0.24) * lamp * (1.30 + 0.06 * sin(t * 2.2));',
  '  col += vec3(0.50, 0.24, 0.07) * exp(-length((uv - lp) * vec2(1.0, 1.15)) * 1.6) * 0.45;',

  // 暖色光斑（悬浮）
  '  for (int i = 0; i < 8; i++) {',
  '    float fi = float(i);',
  '    vec2 bp = vec2(fract(h21(vec2(fi, 3.3)) + t * 0.006), fract(h21(vec2(fi, 7.7)) + t * 0.004));',
  '    float bd = length((uv - bp) * vec2(1.0, 1.35));',
  '    col += vec3(1.0, 0.68, 0.36) * smoothstep(0.045, 0.0, bd) * 0.045;',
  '  }',

  // 顶部暖雾
  '  col += vec3(0.85, 0.48, 0.22) * fbm(uv * vec2(2.2, 2.8) + vec2(t * 0.025, 0.0)) * 0.055;',

  '  return col;',
  '}',
].join('\n');

/* ---------------- 摇滚 · Live 舞台 ---------------- */
const ROCK = [
  'vec3 renderScene(vec2 uv, vec2 p, float t){',
  '  vec3 col = vec3(0.012, 0.009, 0.014);',

  // 烟雾
  '  float sm = fbm(uv * vec2(2.4, 3.2) + vec2(t * 0.045, t * 0.018));',
  '  col += vec3(0.20, 0.18, 0.26) * sm * 0.10;',

  // 三道光柱：顶部光源，向下收窄再散开
  '  for (int i = 0; i < 3; i++) {',
  '    float fi = float(i);',
  '    float sx = 0.5 + 0.33 * sin(t * 0.38 + fi * 2.4);',
  '    float spread = 0.045 + (1.0 - uv.y) * 0.40;',
  '    float ax = (uv.x - sx) / spread;',
  '    float beam = exp(-ax * ax * 2.2);',
  '    float core = exp(-ax * ax * 22.0);',
  '    float fall = smoothstep(0.02, 0.26, uv.y) * (1.0 - smoothstep(0.60, 0.98, uv.y));',
  '    vec3 tint = mix(vec3(1.0, 0.90, 0.72), vec3(1.0, 0.22, 0.16), fi * 0.42);',
  '    col += tint * (beam * 0.75 + core * 0.9) * fall * (0.60 + uPulse * 0.55 + uEnergy * 0.65);',
  // 灯头亮点
  '    col += vec3(1.0, 0.95, 0.85) * exp(-length((uv - vec2(sx, 0.99)) * vec2(1.0, 2.2)) * 18.0) * 1.4;',
  '  }',

  // 舞台台面 + 前缘逆光
  '  float stageY = 0.315;',
  '  float sd = stageY - uv.y;',
  '  float stfl = smoothstep(-0.01, 0.02, sd);',
  '  vec3 stageCol = vec3(0.055, 0.014, 0.012) * (0.5 + 1.6 * exp(-max(sd, 0.0) * 7.0));',
  '  stageCol += vec3(1.0, 0.30, 0.14) * exp(-abs(uv.y - stageY) * 40.0) * 0.55;',
  '  col = mix(col, stageCol, stfl * 0.9);',

  // 舞台地板反光条
  '  float boardY = fract(uv.y * 26.0);',
  '  col += vec3(1.0, 0.36, 0.18) * smoothstep(0.06, 0.0, abs(boardY - 0.5) - 0.42) * stfl * exp(-max(sd,0.0) * 9.0) * 0.35;',

  // 观众剪影：头 + 肩 + 连续身块
  '  float base = 0.245 + 0.012 * sin(uv.x * 11.0 + t * 1.05);',
  '  float crowd = step(uv.y, base);',

  '  float cellW = 0.056;',
  '  float cell = uv.x / cellW;',
  '  float cid = floor(cell);',
  '  float fx = (fract(cell) - 0.5) * cellW;',
  '  float pb = base + 0.040 * (h21(vec2(cid, 9.9)) - 0.5) + 0.020 * h21(vec2(cid, 1.7));',
  '  float hr = 0.019 + 0.009 * h21(vec2(cid, 4.4));',
  '  float hy = pb + 0.036 + 0.011 * sin(t * 1.5 + cid * 2.3) + 0.006 * h21(vec2(cid, 7.7));',
  '  float head = step(length(vec2(fx * 0.96, uv.y - hy)), hr);',
  '  float shoulder = step(length(vec2(fx * 0.62, (uv.y - pb - 0.004) * 1.5)), 0.044 + 0.010 * h21(vec2(cid, 2.2)));',
  '  crowd = clamp(crowd + head + shoulder, 0.0, 1.0);',

  // 举起的手（约 1/5 的人）
  '  float arm = step(0.80, h21(vec2(cid, 3.9)));',
  '  float ay = base + 0.075 + 0.018 * sin(t * 2.1 + cid);',
  '  float armMask = arm * step(abs(fx - cellW * 0.18), 0.007) * step(hy, uv.y) * step(uv.y, ay);',
  '  armMask += arm * step(length(vec2(fx - cellW * 0.18, uv.y - ay)), 0.011);',
  '  crowd = clamp(crowd + armMask, 0.0, 1.0);',

  '  col = mix(col, vec3(0.006, 0.005, 0.008), crowd * 0.94);',

  // 观众头顶的逆光轮廓
  '  float hd = length(vec2(fx * 0.96, uv.y - hy));',
  '  float rim = step(hr, hd) * step(hd, hr + 0.004);',
  '  col += vec3(1.0, 0.45, 0.22) * rim * (0.30 + uPulse * 0.4);',

  // 频闪
  '  float flash = step(0.968, h21(vec2(floor(t * 7.0), 11.0)));',
  '  col += vec3(1.0, 0.98, 0.94) * flash * 0.14;',

  '  return col;',
  '}',
].join('\n');

/* ---------------- 像素 · 像素世界 ----------------
   整幅画面先在 64 格粗网格上取样，最后限成 7 级色阶。
   太阳、山、网格地面、星星全都写在网格坐标里，所以台阶感是
   算出来的而不是后期描的 —— 换个分辨率也不会忽粗忽细。 */
const PIXEL = [
  'vec3 renderScene(vec2 uv, vec2 p, float t){',
  '  float GRID = max(4.0, uRes.x / 64.0);',
  '  vec2 uq = (floor(gl_FragCoord.xy / GRID) * GRID + GRID * 0.5) / uRes;',
  '  float hz = 0.42;',
  '  float up = uq.y - hz;',

  // 天空：地平线橙 → 洋红 → 深紫，三段压色
  '  float st = clamp(up / (1.0 - hz), 0.0, 1.0);',
  '  vec3 col = mix(vec3(1.00, 0.66, 0.30), vec3(0.78, 0.22, 0.50), smoothstep(0.0, 0.26, st));',
  '  col = mix(col, vec3(0.085, 0.038, 0.165), smoothstep(0.24, 0.80, st));',

  // 星：稀疏亮点，缓慢明灭
  '  vec2 sc = floor(uq * vec2(58.0, 40.0));',
  '  float star = step(0.985, h21(sc));',
  '  float tw = 0.45 + 0.55 * sin(t * 2.6 + h21(sc + 5.0) * 6.283);',
  '  col += vec3(1.0, 0.94, 0.82) * star * tw * smoothstep(0.08, 0.34, up) * 1.05;',

  // 太阳：像素圆，下半部被横条切开
  '  vec2 sd = (uq - vec2(0.50, hz + 0.155)) * vec2(1.0, 1.30);',
  '  float sr = 0.150;',
  '  float dist = length(sd);',
  '  float low = step(uq.y, hz + 0.155) * step(0.45, fract((hz + 0.155 - uq.y) * 18.0));',
  '  float sunMask = step(dist, sr) * (1.0 - low);',
  '  vec3 sunCol = mix(vec3(1.0, 0.52, 0.28), vec3(1.0, 0.94, 0.55), smoothstep(hz - 0.02, hz + 0.33, uq.y));',
  // 演奏时把太阳压下去：音符是暖黄色的，正对着落日会糊在一起
  '  sunCol *= 1.0 - 0.22 * uDim;',
  '  col = mix(col, sunCol, sunMask);',
  '  col += vec3(0.40, 0.15, 0.06) * exp(-max(dist - sr, 0.0) * 7.0) * 0.5;',

  // 远山 / 近山：两层台阶剪影，各自的高度用两段正弦叠出锯齿
  '  float mh = hz + 0.030 + 0.048 * abs(sin(uq.x * 7.3 + 2.1)) + 0.016 * abs(sin(uq.x * 19.0));',
  '  col = mix(col, vec3(0.165, 0.058, 0.225), step(uq.y, mh) * step(hz - 0.004, uq.y));',
  '  float nh = hz + 0.016 + 0.028 * abs(sin(uq.x * 11.0 + 0.7)) + 0.010 * abs(sin(uq.x * 27.0 + 1.3));',
  '  col = mix(col, vec3(0.070, 0.024, 0.118), step(uq.y, nh) * step(hz - 0.004, uq.y));',

  // 地平线光带：把天和地咬在一起
  '  col += vec3(1.0, 0.45, 0.28) * exp(-abs(up) * 24.0) * 0.45;',

  // 透视网格地面
  '  if (uq.y < hz) {',
  '    float d = hz - uq.y;',
  // z 是「屏幕纵深」：靠近地平线时封顶，否则 1/d 会冲到几十，
  // 量化成 6px 格子后整片糊成马赛克带
  '    float z = min(0.40 / (d + 0.030), 7.0);',
  '    vec2 g = vec2((uq.x - 0.5) * z * 1.7, z * 0.80 + t * 0.85);',
  '    vec2 f = abs(fract(g) - 0.5);',
  '    float line = step(min(f.x, f.y), 0.06);',
  '    vec3 neon = mix(vec3(1.0, 0.30, 0.72), vec3(0.40, 0.86, 1.0), smoothstep(-0.22, 0.22, p.x));',
  '    col = mix(vec3(0.090, 0.032, 0.140), vec3(0.042, 0.014, 0.076), smoothstep(0.0, hz, d));',
  // 地平线附近网格本就该密到看不见，淡出比硬画干净
  '    float fade = smoothstep(0.006, 0.075, d);',
  '    col += neon * line * (0.42 + uPulse * 0.70 + uEnergy * 0.38) * fade;',
  '    col += neon * line * line * 0.30 * fade;',
  '  }',

  // CRT：隔行暗带，像素游戏的显示器味
  '  col *= 0.88 + 0.12 * step(0.5, fract(gl_FragCoord.y / 3.0));',

  // 限色：7 级一档，这是"像素画"和"低分辨率照片"的分界线
  '  col = floor(col * 7.0 + 0.5) / 7.0;',

  '  return col;',
  '}',
].join('\n');

const SOURCES: Record<string, string> = { cyber: CYBER, classic: CLASSIC, lofi: LOFI, rock: ROCK, pixel: PIXEL };

/* ---------------- 引擎 ---------------- */

export type SceneName = 'cyber' | 'classic' | 'lofi' | 'rock' | 'pixel';

export interface SceneApi {
  canvas: HTMLCanvasElement | null;
  gl: WebGLRenderingContext | null;
  name: string;
  /** 上一帧的时间，用来给渲染降频 */
  lastDraw: number;
  /** 渲染分辨率倍率：0.72 足够，省电且更接近"氛围层" */
  quality: number;
  init(canvas: HTMLCanvasElement): boolean;
  use(name: string): void;
  resize(): void;
  render(o: SceneFrame): void;
}

interface SceneInternal extends SceneApi {
  programs: Record<string, WebGLProgram>;
  prog: WebGLProgram | null;
  u: Record<string, WebGLUniformLocation | null>;
  buf: WebGLBuffer | null;
  shader(type: number, src: string): WebGLShader | null;
}

export const Scene: SceneInternal = {
  canvas: null,
  gl: null,
  programs: {} as Record<string, WebGLProgram>,
  prog: null as WebGLProgram | null,
  u: {} as Record<string, WebGLUniformLocation | null>,
  name: 'cyber',
  quality: 0.72,
  lastDraw: 0,
  buf: null as WebGLBuffer | null,

  init(canvas: HTMLCanvasElement): boolean {
    this.canvas = canvas;
    const opts: WebGLContextAttributes = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' };
    const gl = (canvas.getContext('webgl', opts) ||
      canvas.getContext('experimental-webgl', opts)) as WebGLRenderingContext | null;
    if (!gl) return false;
    this.gl = gl;

    const vs = this.shader(gl.VERTEX_SHADER, VERT);
    if (!vs) return false;
    Object.keys(SOURCES).forEach((key) => {
      const fs = this.shader(gl.FRAGMENT_SHADER, HEAD + '\n' + SOURCES[key] + '\n' + TAIL);
      if (!fs) return;
      const p = gl.createProgram()!;
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error('[scene] link fail', key, gl.getProgramInfoLog(p));
        return;
      }
      this.programs[key] = p;
    });

    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    this.resize();
    this.use(this.name);
    return true;
  },

  shader(type: number, src: string): WebGLShader | null {
    const gl = this.gl;
    if (!gl) return null;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[scene] shader fail', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  },

  use(name: string): void {
    const gl = this.gl;
    if (!gl || !this.programs[name] || !this.buf) return;
    const p = this.programs[name];
    this.name = name;
    this.prog = p;
    gl.useProgram(p);
    const loc: Record<string, WebGLUniformLocation | null> = {};
    ['uRes', 'uTime', 'uBeat', 'uBar', 'uPulse', 'uEnergy', 'uHue', 'uDim', 'uZone'].forEach((k) => {
      loc[k] = gl.getUniformLocation(p, k);
    });
    (this as { u: Record<string, WebGLUniformLocation | null> }).u = loc;
    const a = gl.getAttribLocation(p, 'aPos');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  },

  resize(): void {
    const gl = this.gl;
    const canvas = this.canvas;
    if (!gl || !canvas) return;
    const w = Math.max(1, Math.round(window.innerWidth * this.quality));
    const h = Math.max(1, Math.round(window.innerHeight * this.quality));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    gl.viewport(0, 0, w, h);
  },

  render(o: SceneFrame): void {
    const gl = this.gl;
    const canvas = this.canvas;
    if (!gl || !this.prog || !canvas) return;
    const u = this.u;
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform1f(u.uTime, o.t);
    gl.uniform1f(u.uBeat, o.beat);
    gl.uniform1f(u.uBar, o.bar);
    gl.uniform1f(u.uPulse, o.pulse);
    gl.uniform1f(u.uEnergy, o.energy);
    gl.uniform1f(u.uHue, o.hue);
    gl.uniform1f(u.uDim, o.dim);
    gl.uniform1f(u.uZone, o.zone);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },
};
