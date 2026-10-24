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

线上更新不靠“刷新一下试试”，而是三条独立信号汇成一个开关：

1. **Service Worker**（`registerType: 'prompt'`）—— 新 SW 就绪时 `needRefresh` 为真。
   刻意不用 `autoUpdate`：演奏中被强刷是最糟的体验。
2. **`version.json`** —— 每次构建产出 `{version, buildId, time}`，不进 precache。
   被强缓存、或 SW 还没激活时，它仍然能发现服务器上是新的。前端每 5 分钟和页面重新可见时各查一次。
3. **手动检查** —— 设置页底部显示版本号与构建时间，点「检查更新」立刻比对；
   拿不到 `version.json` 时退回 `registration.update()` 让 SW 自己比 `sw.js`。

任一条命中 → 顶部出现「有新版本 · 立即刷新」提示条；演奏中不打扰，回到首页再出现。

## 安装

满足安装条件的浏览器会抛 `beforeinstallprompt`，首页底部「装到桌面 · 断网也能玩」
就是它变的 —— 地址栏那个安装图标受用户档案状态影响（装过一次、点过忽略、
企业策略都会让它消失），所以不能只依赖它。事件在 `index.html` 里就接住，
避免 React 挂载慢一步错过。iOS Safari 没有这个事件，设置里给的是「分享 → 添加到主屏幕」的文字指引。

`display: standalone` + `screenshots` 一并给上，Chrome 才会弹带预览的富安装对话框。

## 部署

- **WorkBuddy**：发布 `apps/pwa/dist`（静态站，`python3 -m http.server $PORT`）。
- **GitHub Pages**：`pnpm build:gh` 后把 `dist` 推到 `gh-pages` 分支。`.nojekyll` 已随构建产出。

发布到 WorkBuddy 的分享域名时，**必须带上 sharecode 构建**：

```bash
OMB_SHARECODE=OKGUBBGDZG pnpm build
```

原因：那个域名只有带 `?sharecode=` 才返回 HTML，裸访问 `/` 是 403。
Chrome 判定「可安装」时会去取 manifest 的 `start_url`，拿到 403 就不在地址栏给安装入口 ——
同一个包在 Pages 上有提示、在分享域名上没有，差别就在这里。带上之后 `start_url` 变成
`./?sharecode=…`，装出来的应用也能直接打开。

## 分享图与安装截图

```bash
pnpm --filter @o-beat/pwa build        # 先有 dist
pnpm --filter @o-beat/pwa gen:social   # 生成 public/og.png 与 public/screenshots/*
```

三张图由脚本渲染：手机那张是真实首页截图，桌面那张与 `og.png` 共用一张版式卡
（应用是竖屏满屏布局，直接拉成 16:9 会把三列模式卡拉变形）。
截图和分享图都不进 precache，不占用户的离线配额。

## 启动兜底

`index.html` 里有一段看门狗：8 秒后 `documentElement.dataset.omb` 还不是 `ready`，
就把「没能启动起来」面板亮出来，附上报错与环境信息。之前这类失败在手机上只表现为**黑屏**，
连反馈都无从说起。`localStorage` 也全部走 try/catch —— Safari 无痕、iOS 关掉跨站跟踪、
部分 App 内置浏览器一碰就抛 `SecurityError`，而它在引擎模块顶层，一抛整包都进不来。


## 架构决策

见 [`docs/adr/0001-monorepo-and-framework.md`](docs/adr/0001-monorepo-and-framework.md)：
界面用框架、引擎用原生 JS，两边的边界是一个快照对象。
