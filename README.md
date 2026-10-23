# O My Beat

节奏练习 · 音感训练。竖屏、单指、三模式的音乐小游戏，以 PWA 形式发布。

| | |
|---|---|
| 线上（WorkBuddy） | https://obeat.app.workbuddy.host |
| 线上（GitHub Pages） | https://aispin.github.io/o-beat/ |
| 设计依据 | [`docs/prd.md`](docs/prd.md) — 玩法与数值的唯一依据 |
| 视觉依据 | `prototype/`（冻结的高保真原型，只读参考） |

## 仓库结构

```
.
├─ apps/pwa/            正式产品：React 19 + Vite 8 + Tailwind v4 + shadcn/ui + TS
│  ├─ src/engine/       canvas / WebAudio 引擎（纯 JS，不碰 React）
│  ├─ src/components/   界面层（shadcn 组件 + 页级组件）
│  ├─ src/hooks/        快照订阅、版本发现
│  └─ public/assets/    采样（钢琴 8 锚点 + 鼓组 3 套 × 4 件，312KB）
├─ prototype/           旧版单文件原型，冻结保留，用于视觉对照
└─ docs/
   ├─ prd.md
   └─ adr/              架构决策记录
```

## 开发

```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm typecheck      # 仅类型检查
pnpm build          # tsc --noEmit && vite build → apps/pwa/dist
pnpm build:gh       # 同上，base=/o-beat/（GitHub Pages 用）
```

要求 Node ≥ 22、pnpm ≥ 12。

## 版本发现

线上更新不靠"刷新一下试试"，而是三条独立信号汇成一个开关：

1. **Service Worker**（`registerType: 'prompt'`）—— 新 SW 就绪时 `needRefresh` 为真。
   刻意不用 `autoUpdate`：演奏中被强刷是最糟的体验。
2. **`version.json`** —— 每次构建产出 `{version, buildId, time}`，不进 precache。
   被强缓存、或 SW 还没激活时，它仍然能发现服务器上是新的。前端每 5 分钟和页面重新可见时各查一次。
3. **手动检查** —— 设置页底部显示版本号与构建时间，点「检查更新」立刻比对。

任一条命中 → 顶部出现「有新版本 · 立即刷新」提示条；演奏中不打扰，回到首页再出现。

## 部署

- **WorkBuddy**：发布 `apps/pwa/dist`（静态站，`python3 -m http.server $PORT`）。
- **GitHub Pages**：`pnpm build:gh` 后把 `dist` 推到 `gh-pages` 分支。`.nojekyll` 已随构建产出。

## 架构决策

见 [`docs/adr/0001-monorepo-and-framework.md`](docs/adr/0001-monorepo-and-framework.md)：
界面用框架、引擎用原生 JS，两边的边界是一个快照对象。
