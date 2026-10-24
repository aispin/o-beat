# lofi-lab · 鼓组合成实验台

`docs/research/lofi-drums.md` 里那张参数表的来源。用来在**真正的 WebAudio 行为**下试参数，
不依赖产品代码、不改任何引擎文件。

## 为什么这么搭

- 用 `OfflineAudioContext` 而不是自己写 DSP：实验里听到的就是实现后跑出来的，没有移植损耗。
- 用 headless Chrome 而不是手动开页面：一条命令渲染一批，方便把 6 个方案摆在一起比。

## 用法

```bash
# 仓库根目录起静态服务（实验页要从 /apps/pwa/public 取鼓采样）
python3 -m http.server 8899 --bind 127.0.0.1

# 另开一个终端，渲染指定 case
cd docs/research/lofi-lab
node run.mjs snare-variants groove-sample groove-synth
# → out/*.wav
```

需要 Chrome（`/Applications/Google Chrome.app`）和 ffmpeg（转 mp3 用）。

可用 case：

| case | 内容 |
|---|---|
| `groove-sample` | 4 小节，现有 kpr77 采样鼓组 + 电钢 |
| `groove-synth` | 同编曲，合成 lofi 鼓组 |
| `groove-synth-dark` | 同上，整体更暗、军鼓更糯 |
| `snare-variants` | 军鼓 6 方案（采样 / 降调 / 单层 / 三层 / 脏 / 糯） |
| `snare-ab` | 采样与合成交替 4 轮 |
| `kick-ab` | 底鼓 4 方案 |
| `hat-ab` | 踩镲 4 方案 |

## 测

```bash
python3 analyze.py out/snare-variants.wav 0.15 1.50 2.85 4.20 5.55 6.90
```

输出峰值、RMS、10→90% 瞬态时间、−20 dB 衰减、频谱质心、五段能量占比。
指标定义与判据见 `../lofi-drums.md` §4.3。

## 注意

- `out/` 是产物目录，不入库。
- 采样从 `/apps/pwa/public/assets/drums/kpr77/` 读，所以服务必须起在仓库根目录。
- 页面里的 `KIT_SYNTH` 是实验参数，**不是**产品代码；落地时要搬到 `apps/pwa/src/engine/sfx.ts`。
