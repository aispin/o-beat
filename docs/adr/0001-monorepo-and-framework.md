# ADR 0001 · monorepo 与前端技术选型

- 状态：已采纳
- 日期：2026-10-24
- 相关：`docs/prd.md` §15、`apps/pwa/`

## 背景

原型是四个 `<script>` + 一份 1120 行的 CSS，单页、无构建、无依赖。它验证了玩法，
但要作为正式产品继续长功能：设置项会变多、要加新手引导、要加曲目解锁、
要加 PWA 更新、将来还要出小程序版。这些都不是"再加一个 canvas 函数"能解决的。

同时有一个现实约束：**每次改动都要重新读一遍上下文**。原型的 `app.js` 2251 行、
`style.css` 1120 行，任何一次 UI 微调都得把整个文件捞进上下文，token 成本和出错概率都高。

## 决策

1. 仓库改为 **pnpm workspace monorepo**，正式产品在 `apps/pwa`，`prototype/` 冻结保留。
2. 界面层用 **React 19 + Vite 8 + Tailwind v4 + shadcn/ui + TypeScript**（依赖全部取最新稳定版）。
3. **引擎保持纯 JS**：`src/engine/{game,sfx,scene,backing}.js` 从原型逐行迁移，
   只删掉 DOM 操作，不改算法。TS 通过 `allowJs` + `checkJs: false` 引用，
   在 `src/engine/index.ts` 给出一层显式类型作为边界。
4. 引擎与界面之间只有一个接口：**快照 + 命令**（`subscribe / getSnapshot` ↔ `setMode / start / …`）。

## 为什么界面要框架，引擎不要

| 维度 | 纯 vanilla 继续加功能 | React + shadcn |
|---|---|---|
| 加一个设置项 | 状态在 `settings`，DOM 在 `index.html`，样式在 CSS，绑定在 `bindUI()` —— 四处改，漏一处就静默失效 | 一个受控组件 + 一次 `setSettings`，两处 |
| UI 改动要读多少上下文 | 整个 `app.js` + `style.css`（约 3300 行） | 目标组件（100–200 行） |
| 弹层可达性（焦点陷阱、Esc、滚动锁） | 自己写 | Radix 已处理 |
| 主题化换肤 | 手写 CSS 变量 + `dataset` | 同一套变量，工具类直接消费 |
| 首屏 JS 体积 | ≈90KB | ≈452KB（gzip 145KB），可接受 |
| 状态漂移 | `S` 与 DOM 两份真相，靠人肉同步 | 单一快照，渲染是纯函数 |

结论：**界面层 500 行 DOM 操作是纯负债**，换成组件后同样的功能只需 ~800 行 TSX，
但每轮迭代的上下文成本降了一个数量级。这笔交易划算。

引擎反过来：canvas 绘制、谱面生成、判定窗口、WebAudio 调度，React 一点忙都帮不上，
逐行重写成 TS 要花掉的上下文与回归风险远超收益。所以只在边界加类型，
内部保持可验证的 JS。

## 迁移方式

`game.js` 不是重写，是**机械迁移**：

1. 原 `app.js` 的前 1653 行（配置、曲目、谱面生成、布局、绘制、判定）整段保留；
2. 删掉 6 处 DOM 调用，替换为 `emit()` / `flash()` / `comboSeq++`；
3. 后 600 行（`startRun` / `endRun` / 各个 `render*` / `bindUI`）重写为
   「构造快照 + 命令函数」，UI 由 React 接管。

结果：玩法代码 0 改动，12 组谱面（4 风格 × 3 档）的合法性校验与迁移前完全一致。

## 影响

- 只有一个 app，但已经按 workspace 组织，将来 `apps/miniprogram` 可以直接复用
  `src/engine` 的移植约定（PRD §10.8：`AudioEng` 是唯一的音频适配层）。
- `dist` 不进主分支，只进 `gh-pages` 分支。
- 引擎的 JS 边界是显式的：新增引擎能力时，必须同时在 `index.ts` 补类型，否则界面拿不到。
