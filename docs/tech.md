# O My Beat · 技术文档

> 面向接手代码的人。产品规则看 [`prd.md`](prd.md)，本文只讲**怎么实现、为什么这么实现、改东西该动哪里**。
> 最后更新：2026-10-24（引擎全面 TypeScript 化 + 七首手写编曲 + 采样本地化 + 分风格技术分册）

---

## 1. 一分钟概览

| | |
|---|---|
| 形态 | PWA，竖屏单页，React 19 + Vite 8 + Tailwind v4 + shadcn/ui |
| 玩法 | 三个模式共用一套单局骨架：鼓手 / 旋律家 / 节奏 |
| 引擎 | 纯 TypeScript，不碰 React；画布 2D（音符）+ WebGL（氛围层） |
| 音频 | 两套独立 AudioContext：**对局**（sfx.ts）与**背景音乐**（bgm/） |
| 分册 | 每种风格一套编制 + 一册文档，见 §6.7；lofi 已完成 |
| 素材 | 67 个 mp3，1.42MB，全部本地（`public/assets`），不走 CDN |
| 离线 | precache 应用外壳 607KB；采样走运行时 `CacheFirst`，不占首装 |
| 类型 | `strict` + `noUnusedLocals` + `noUnusedParameters`，`tsc --noEmit` 是构建第一步 |

---

## 2. 目录与脚本

```
apps/pwa/
├─ src/engine/
│  ├─ index.ts          引擎门面：UI 只认这里
│  ├─ game.ts           玩法真源：谱面、判定、渲染、快照（约 2600 行）
│  ├─ sfx.ts            对局音色引擎：混音台 / 卷积混响 / 物理建模 / 程序化 SFX
│  ├─ scene.ts          WebGL 氛围层：5 套 GLSL + 一套公共框架
│  ├─ backing.ts        伴奏排程：按 GROOVE 生成鼓 / 贝斯 / 和声事件
│  ├─ lofi-kit.ts       lofi 套鼓：纯合成，两套预设随机，对局与 BGM 共用
│  └─ bgm/              背景音乐，7 个模块，见第 6 节
├─ src/components/      界面（首页 / HUD / 结算 / 设置 / 暂停 / 更新条）
├─ src/hooks/           快照订阅、版本发现、安装提示、BGM 生命周期
├─ public/assets/       piano 8 + drums 12 + inst 47 = 67 个 mp3
└─ vite.config.ts       PWA / precache / 运行时缓存 / 版本注入
```

```bash
pnpm dev            # 5173
pnpm typecheck      # tsc --noEmit
pnpm build          # tsc --noEmit && vite build
pnpm build:gh       # base=/o-beat/，GitHub Pages
```

Node ≥ 22，pnpm ≥ 12。

---

## 3. 分层与依赖方向

依赖是**单向**的，不出现环：

```
components / hooks
        │  只 import @/engine（门面）
        ▼
     engine/index.ts
        │
   ┌────┴──────────────┬──────────────┐
   ▼                   ▼              ▼
 game.ts            bgm/            scene.ts
   │                 │               （无依赖）
   ├──► sfx.ts ◄─────┘
   └──► backing.ts ──► bgm/score.ts（只读编曲数据）
```

| 层 | 允许知道什么 | 明确不知道什么 |
|---|---|---|
| `game.ts` | SFX / Scene / Backing / bgm.score | React、DOM 结构、界面文案 |
| `sfx.ts` | WebAudio + `lofi-kit`（无其它依赖） | 曲目、场景、玩法 |
| `backing.ts` | SFX + 曲目（和弦、拍号） | 画面、判定、界面 |
| `bgm/` | 自己的采样与编曲 | 玩法、判定、对局状态 |
| 界面 | 快照 + 命令 | 引擎内部任何字段 |

**引擎不 import React，React 不 import 引擎内部。** 唯一的桥是一个快照对象：
状态变了 `emit()` 一份新对象，界面用 `useSyncExternalStore` 订阅；界面想改状态只能调命令
（`setMode` / `start` / `pause` …）。这条窄接口是「引擎原生、界面框架」能共存的前提，
也是小程序移植时唯一需要重写的地方。

---

## 4. 快照协议

`GameSnapshot`（定义在 `engine/index.ts`）是界面能看到的**全部**状态：

```ts
phase: 'home' | 'playing' | 'paused' | 'result'
mode  : 'drummer' | 'melodist' | 'rhythm'
diff  : 'casual' | 'normal' | 'strict'
song  : SongDef        // 对象引用稳定，只有真的换歌才变
scene : SceneId        // 5 套：cyber classic lofi rock pixel
bpm / score / combo / countdown / result / settings …
```

两条约定：

1. **引用稳定**。`song`、`settings` 换新对象才算变；界面 effect 依赖它们，否则每次
   `emit()` 都会把 BGM 重排一遍。
2. **seq 字段**。`flashSeq` / `comboSeq` / `bpmSeq` 是自增序号，用来触发一次性动画，
   而不是让界面去 diff 数值。

---

## 5. 对局音频（`sfx.ts`）

### 5.1 信号链

```
采样 / 合成音源
   → 乐器总线（增益 · 声像 · 低切 · 低通）
   → 干声 ────────────────┐
   → 发送 → 卷积混响 ──────┤→ 胶水压缩(−16dB) → 限幅(−4.5dB) → 输出(0.86)
                          └→ 磁带底噪
```

- 侧链 `duck()`：底鼓落下时压 `pad/keys/bass` 三条总线。**必须用固定基准值**做目标，
  读 `.gain.value` 会在压缩过程中逐次衰减（原型踩过）。
- 空间预设 6 套：`cyber / classic / lofi / rock / chip / practice`。冲激响应是程序化生成的
  （噪声衰减 + 早期反射），按名字缓存，零素材成本。换 IR 时先把湿度拉到 0，避免爆音。
- 全部节点都是 WebAudio 1.0 标准节点，不依赖 AudioWorklet —— 微信 `WebAudioContext` 才能对上。

### 5.2 音色

| 类别 | 实现 |
|---|---|
| 采样乐器 | `piano`（8 锚点 C3–C6，最近邻 + playbackRate 变速） |
| 物理建模 | `guitar` / `bass`：Karplus-Strong，按音高缓存 buffer，过载靠 tanh 曲线 |
| FM 合成 | `rhodes`：正弦载波 + 调制器 + 音叉泛音 + 5.2Hz 颤音 |
| 减法合成 | `lead`、`pad`：三层失谐锯齿 + 次低音 + 滤波包络 + 合唱延迟 |
| 芯片音 | `chipLead`（方波 + 五度，5kHz 以上不加）、`chipBass`（三角波） |
| 鼓 | 采样 3 套（acoustic / techno / kpr77）× 4 件；`chip` / `lofi` 两套完全合成 |

`lofi` 套鼓在 `lofi-kit.ts`，唯一的导出是 `lofiHit(ctx, dest, hit, t, v, {dark, pan})`。
给一个目标节点就能发声，所以 `sfx.ts`（对局总线）和 `bgm/drums.ts`（BGM 总线）共用同一份代码。
`amp` 是「与同一 v 的采样鼓等响」的系数，不是随手写的增益 —— 改它之前先读 `docs/research/lofi-drums.md`。

> 力度（velocity）同时影响音量和低通截止 —— 轻敲不只是小声，是更闷。
> 这是"真实感"最便宜也最有效的来源。

---

## 6. 背景音乐（`bgm/`）

### 6.1 为什么单独一套上下文

BGM 只在对局外响（首页、结算），和 `sfx` 分开的好处：

- 对局的限幅/侧链不会压到 BGM，BGM 的音量包络也不用给击打音让位；
- 停止对局音效开关（`settings.sound`）不会顺手掐掉背景音乐；
- 播放/淡出/换曲的时钟互不干扰。

代价：**同一份采样会被两个 AudioContext 各解码一次**（AudioBuffer 不能跨上下文共享）。
piano 224KB，可接受；真要优化就让 BGM 复用对局上下文，但会重新引入上面三个耦合。

### 6.2 生命周期

```
useBgm(snapshot)
  ├─ phase ∈ {home, result} 且 settings.bgm → 延迟 260ms 后 play()
  │     260ms 是为了跨过用户点「开始」的那一下：立刻起播会先响半个音再被掐掉
  └─ 其余情况 → stop()（演奏中、暂停中都不响）
```

- 浏览器要求手势唤醒音频：`play()` 里先 `resume()`，没解锁就挂 `pointerdown / touchstart /
  mousedown / keydown` 四个一次性监听（capture，passive），等第一次点按。
- 切后台（`visibilitychange`）必须 `silence()`：定时器被节流后回到前台会一口气补排一串音符。
- `setSong()` 换曲：运行中先淡出 160ms，等新曲目的采样齐了再从第一拍起。
- 开发期 `window.__bgmBus()` 可拿到总线，用来接录音链路量频谱；生产构建里整块被摇掉。

### 6.3 排程

| 参数 | 值 | 说明 |
|---|---|---|
| LOOKAHEAD | 0.15s | 只提前排这么远，切歌/停止才停得干净 |
| TICK | 40ms | 排期时钟间隔 |
| VOL | 0.62 | 再乘每首的 `mix.vol` |
| 总低通 | 每首 `mix.cut` | lofi 3.2k、古典 11k、电子 13k |

`scheduleStep(bus, sc, i, t)` 按「第 i 个十六分位」把这一格的贝斯 / 和声 / 鼓排出去，
一拍最多排一次，不维护事件表 —— 结构谱是固定的，按格算比排序更快。

### 6.4 手写编曲（`compose.ts`）

七首曲子都是**手写数据**，不是生成器产物。上一版按「和弦音 + 种子挑动机」生成旋律，
结果每首都是「每小节六个等距音」，听十秒就分不清。手写才有动机、有呼吸、有句尾。

旋律写成字符串：**一小节一行、16 格（3/4 是 12 格）、`.` 是留白、数字是绝对 MIDI**。
用绝对音高而不是音级，是为了能直接看出走向、也能对着和弦校对。

```ts
lead: seq([
  '76 . . . 79 . . . 81 . . . 79 . . .',
  '. . 74 . 76 . . . 79 . . . . . . .',
])
```

每首还带一份混音表：

| 字段 | 作用 |
|---|---|
| `comp.type` | 伴奏型：`pad` / `waltz`（蹦-恰-恰）/ `stab`（切分）/ `pick`（指弹）/ `riff`（强力和弦）/ `arp8` / `hold` |
| `bass.type` | `quarter` / `eighth` / `half` / `waltz` / `root5` / `riff` |
| `drums` | 底鼓/军鼓的十六分位数组、踩镲型（`eighth` / `16` / `off` / `none`） |
| `mix` | `cut` 总低通、`lead/comp/bass` 三档音量、`vol` 整首 |
| `echo` / `vinyl` / `swing` | ping-pong 回声、黑胶底噪、奇数十六分位推后的秒数（`arrange.ts` 逐格加） |

**改一首曲子只动 `compose.ts` 对应那一行**，不用碰排程器。

### 6.5 结构谱与缓存

`score.ts` 的 `buildScore(song)` 把「曲目定义」变成「编曲数据」：
和弦名 → 绝对音高、8 小节进行、每小节用第几个和弦（`prog`）、以及给伴奏层用的
`bassOct` / `arpOrder`。

`scoreOf(song)` 按 `id|bpm|meter|scene|chords` 缓存。同一首曲子反复进出首页必须完全一致，
否则用户会听到另一段旋律。

### 6.6 采样加载

`samples.ts` 的 `needSamples(score)` 只挑**这首曲子用到的**乐器与鼓组；
`ensureSamples()` 逐组 `fetch → decodeAudioData` 并塞进 `bus.bufs`。
相邻采样最多差 3 个半音，再远变速就会听出「磁带跑调」。

| 组 | 文件数 | 体积 |
|---|---|---|
| `piano`（C3–C6 八锚点） | 8 | 224KB |
| `inst/`：bass-electric / guitar-electric / guitar-nylon / violin / cello / flute | 47 | 1.1MB |
| `drums/`：acoustic / techno / kpr77 × 4 件 | 12 | 88KB |

来源：`tonejs-instruments`（打包 MIT），采样本体 CC0（VSCO2 CE / Iowa / Karoryfer）。
用 ffmpeg 统一转成 `单声道 44.1kHz 96kbps`，并 `atrim + afade` 只留有用的一段。
**全部落在 `public/assets`，随构建发布，不引用任何 CDN。**

### 6.7 风格分册（每个风格一套编制）

一个风格要立得住，需要四样东西**同时**到位：

| 件 | 落在哪 | 举例（lofi） |
|---|---|---|
| 编制 | `compose.ts` 每首的 `inst` / `comp` / `bass` / `drums` | 电钢 + 尼龙弦 + 电贝斯 + 合成鼓 |
| 音色参数 | `voices.ts` 的 `voice()`、`lofi-kit.ts` | 电钢 lp 2600 + 12 ms 叠层 |
| 混音开口 | `mix.cut` + `lead / comp / bass / vol` | 3200 Hz，0.44 / 0.26 / 0.52 / 1.5 |
| 空间 | `engine.ts` 的 `vinyl`、`sfx.ts` 的 `SPACES` | 黑胶 0.05 + IR 1.4 s / tape 0.032 |

只换鼓组、或只改 `cut`，得到的是「同一首歌换了件衣服」。五个风格当前各自的一套：

| 风格 | 主奏 | 和声 | 低音 | 鼓 | cut |
|---|---|---|---|---|---|
| `pixel` | `chipLead` 方波 | `chipLead` arp8 | `chipBass` 三角 | `chip` 全合成 | 8200 |
| `cyber` | `bell` / `pluck` | `saw` pad / `epiano` stab | `ebass` / `sub` | `techno` / `kpr77` | 13000 / 9000 |
| `classic` | `violin` | `piano` waltz | `cello` | 无 | 11000 |
| `lofi` | `epiano` / `flute` | `nylon` arp8 / pick | `ebass` half / `nylon` root5 | `lofi` 合成 | 3200 / 8000 |
| `rock` | `egt` 失真 | `egt` riff | `ebass` eighth | `acoustic` | 6400 |

每种风格一册，逐册调优、逐册记录：

| 册 | 状态 | 内容 |
|---|---|---|
| [`tech-lofi.md`](tech-lofi.md) | **已完成** | 两首 lofi 的编曲、作曲、鼓组参数表、混音基线、调参手册、反例 |
| `tech-classic.md` | 待写 | 钢琴三重奏、三拍子重心、无鼓时的空间处理 |
| `tech-rock.md` | 待写 | 失真吉他、power chord、重鼓与削波余量 |
| `tech-cyber.md` | 待写 | FM 钟、超锯齿、ping-pong 回声、sub 与低频管理 |
| `tech-pixel.md` | 待写 | 方波 / 三角波、限色、谱面即旋律 |

写下一册时照 [`tech-lofi.md` §9](tech-lofi.md) 的模板：四件套原则、必答的 8 个问题、维护规则。

---

## 7. 场景层（`scene.ts`）

5 套 GLSL：`cyber`（赛博朋克）、`classic`（音乐家的房间）、`lofi`（慵懒房间）、
`rock`（Live 舞台）、`pixel`（像素世界，64 格粗采样 + 7 级限色）。

- 只用 GLSL ES 1.00 / WebGL1，小程序的 canvas 也对得上。
- 一个全屏三角形，公共头（噪声 / fbm / 色相旋转）+ 每场景的 `renderScene()` + 公共尾（暗角 / 对比 / 抖动）。
- Uniform 契约：`uRes uTime uBeat uBar uPulse uEnergy uHue uDim uZone`。
- `quality = 0.72` 渲染倍率，CSS 拉满屏；`game.ts` 里按 32ms 降频（≈30fps）—— 它是氛围层，
  不该跟音符抢帧。
- WebGL 不可用 → `boot()` 记一条 warn，背景退回纯色，游戏照常。

---

## 8. 构建与缓存

| 资源 | 策略 | 原因 |
|---|---|---|
| HTML | `NetworkFirst`，**不预缓存** | 新版本要能被发现 |
| JS / CSS / 图标 / 字体 | precache（约 607KB） | 离线可用 |
| 采样 `*.mp3` | 运行时 `CacheFirst`（`samples` 缓存，上限 200） | 67 个文件 1.42MB，全塞进首装太重 |
| `version.json` | 不进 precache，每 5 分钟 + 页面可见时查 | SW 没激活时也能发现新版本 |
| `og.png` / `screenshots/` | 不进 precache | 只给分享与安装对话框看 |

版本发现三条独立信号合成一个开关：SW `needRefresh` / `version.json` 比对 / 设置页手动检查。
`registerType: 'prompt'`，**刻意不用 autoUpdate** —— 演奏中被强刷是最糟的体验。

发布到 WorkBuddy 分享域名必须带 `OMB_SHARECODE=…` 构建，否则 manifest 的 `start_url` 拿 403，
Chrome 不会给安装入口。

---

## 9. 怎么验证

### 9.1 必跑

```bash
pnpm typecheck && pnpm build      # 类型 + 构建；构建第一步就是 tsc
```

### 9.2 冒烟（无头浏览器）

```bash
# 1) 起 preview
pnpm preview            # 4173

# 2) headless Chrome 开 ?debug，确认 data-omb="ready"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --virtual-time-budget=9000 --dump-dom http://localhost:4173/ \
  | head -c 200
```

`?debug` 会挂出 `window.__OMB`：

```js
__OMB.S.phase          // 'playing'
__OMB.S.notes.length   // 谱面音符数
__OMB.setMode('melodist'); __OMB.startRun()
```

三个模式各起一局，看 `phase === 'playing'`、`notes` 非空、控制台无异常。
（无头环境没有用户手势，`SFX.ready` 会是 false —— 这是正常的，不是 bug。）

### 9.3 音频

用 `MediaRecorder` 录 10 秒，`ffmpeg` 量三件事：

```bash
ffmpeg -i take.webm -af volumedetect -f null -      # RMS 与峰值
# 分频段能量：lowpass 150 / bandpass 500 / bandpass 1500 / highpass 4000
```

验收线：RMS 0.05–0.10、峰值 < 0.95（无削波）、每首的分频段特征不同。
七首实测 peak 0.62–0.78，RMS 0.056–0.093。

### 9.4 手动验收清单

- [ ] 首页 BGM 随曲目切换；关掉背景音乐后开始按钮的波形退成平线
- [ ] 演奏中 BGM 停、结算页回来；暂停不响
- [ ] 三模式各打一局，MISS 时 L0 伴奏不断
- [ ] 切后台再回来，BGM/对局都不补排、不叠音
- [ ] 断网重开能玩（外壳已缓存；新曲目的采样第一次需要联网）

---

## 10. 改东西该动哪里

| 想改 | 动这里 |
|---|---|
| 判定窗口、计分、BPM 阶梯 | `game.ts` 的 `CFG` |
| 曲目列表 / 调性 / 拍号 | `game.ts` 的 `SONGS` |
| 某个模式的谱面密度 | `game.ts` 的 `buildChart()` 分支 |
| 某首曲子的旋律、伴奏型、音量 | `bgm/compose.ts` 对应那一行 |
| **lofi 的编曲 / 音色 / 混音细节** | **[`tech-lofi.md`](tech-lofi.md)** — 参数表、调参手册、反例 |
| 新增一首曲子 | `bgm/compose.ts` 加一条 + `game.ts` 的 `SONGS` 加一条 |
| 采样（换音色 / 加音域） | `public/assets/inst/…` + `bgm/samples.ts` 的 `SAMPLES` |
| 对局音色、混响空间 | `sfx.ts` 的 `SPACES` / `BUS_DEF` / `INST` |
| lofi 鼓的手感（软硬、胖瘦） | `lofi-kit.ts` 的 `BRIGHT` / `TAPE` 两套预设 |
| 伴奏律动（鼓型、切分） | `backing.ts` 的 `GROOVE` |
| 场景配色与氛围 | `scene.ts` 对应 shader 的 `renderScene()` |
| 缓存策略、版本号 | `vite.config.ts` |

---

## 11. 已知取舍

1. **两套 AudioContext 会重复解码 piano**（224KB）。为解耦忍了；真要省内存可让 BGM 借用对局的 ctx。
2. **`backing.ts` 与 `game.ts` 共用 `scoreOf()`**：一个排伴奏、一个出谱面。曲子改一次两边同时变，
   这是有意的（听到的就是要打的）。但也意味着编曲出错会同时影响两处。
3. **像素心跳的旋律既是 BGM 也是谱面**：`ARCADE_MEL` 在 `compose.ts`，通过 `sc.lead` 被
   `buildArcadeChart()` 读取。改那段旋律 = 同时改听感和谱面。
4. **采样变速上限 ±3 半音**：超出会听出跑调。加音域就补采样，别扩大变速范围。
5. **小程序移植**：只用 WebAudio 1.0 节点；`ConvolverNode` 缺失时退化为 4 级串联延迟的
   Schroeder 混响。`sfx.ts` 与 `bgm/` 都不碰 DOM 结构，换 `AudioContext` 实现即可。
6. **`game.ts` 仍是一整块**（约 2600 行）。它是玩法真源，拆细会让「改一个数值要跨三个文件」，
   暂时保持单文件；再长就该按「谱面 / 判定 / 渲染 / 快照」四块分。
7. **`swing` 是绝对秒数，不随 BPM 缩放**。同一个 0.012 在 64 BPM 约 5%、在 132 BPM 约 11%。
   目前只有 lofi 用，够用；将来若要跨曲速复用，该改成「十六分音符的百分比」。
8. **风格参数散在四个文件**（`compose.ts` / `voices.ts` / `lofi-kit.ts` / `sfx.ts` 的 `SPACES`）。
   没有统一的「风格套件」对象，因为每首曲子的编制本来就不同。代价是调一个风格要认四个位置，
   所以每个风格补一册文档，把位置与数值固定下来。
