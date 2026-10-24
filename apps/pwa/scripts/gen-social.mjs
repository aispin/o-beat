/* 生成分享图与安装截图。
 *
 *   pnpm --filter @o-beat/pwa build && node scripts/gen-social.mjs
 *
 * 产出（都进 public/，会被构建原样拷出去）：
 *   public/og.png                          1200×630  og:image / twitter:image
 *   public/screenshots/narrow-390x844.png  390×844   安装对话框（手机）
 *   public/screenshots/wide-1280x720.png   1280×720  安装对话框（桌面）
 *
 * 手机那张是真实截图，桌面那张与 og 共用一张版式卡：应用本身是竖屏满屏布局，
 * 直接拉成 16:9 会把三列模式卡拉得没法看，套进设备框反而更像成品。
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PUBLIC = path.join(ROOT, 'public');
const PORT = 4409;
const DBG = 9479;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error('先构建：pnpm --filter @o-beat/pwa build');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let rel = decodeURIComponent(url.pathname);
  if (rel.startsWith('/o-beat/')) rel = rel.slice('/o-beat'.length);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(DIST, rel);
  if (!file.startsWith(DIST) || !existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const proc = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader',
    `--remote-debugging-port=${DBG}`,
    `--user-data-dir=/tmp/omb-social`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let list = [];
for (let i = 0; i < 120; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${DBG}/json/list`);
    list = await r.json();
    if (list.length) break;
  } catch {}
  await sleep(200);
}
const ws = new WebSocket(list.find((x) => x.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pend = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  }
});
const send = (m, p = {}) =>
  new Promise((res) => {
    const i = ++id;
    pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.result?.value;
const metrics = (width, height, scale = 1) =>
  send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: scale > 1 });
const shot = async (file) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log('  →', path.relative(ROOT, file));
};

await send('Page.enable');
await send('Runtime.enable');

/* 1. 手机截图：真实首页。先把安装提示条压掉，截图里不该有它。 */
console.log('手机截图 390×844@2x');
await metrics(390, 844, 2);
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(1200);
await ev(`localStorage.setItem('omb.installPromptDismissed','1')`);
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(3500);
await ev(`document.querySelector('.home-scroll')?.scrollTo(0,0)`);
await sleep(400);
mkdirSync(path.join(PUBLIC, 'screenshots'), { recursive: true });
const narrowPath = path.join(PUBLIC, 'screenshots/narrow-390x844.png');
await shot(narrowPath);

/* 2. 版式卡：og 与 wide 共用，靠 vmin 自适应两个尺寸 */
console.log('版式卡');
const phone = readFileSync(narrowPath).toString('base64');
const card = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;overflow:hidden}
  body{
    background:#07090D;color:#E7ECF3;
    font-family:-apple-system,'PingFang SC','Microsoft YaHei',system-ui,sans-serif;
    display:flex;align-items:center;justify-content:center;gap:7vmin;
    padding:0 7vmin;position:relative;
    -webkit-font-smoothing:antialiased;
  }
  .glow{position:absolute;inset:0;pointer-events:none;
    background:
      radial-gradient(46vmax 30vmax at 12% -6%, rgba(91,140,255,.30), transparent 62%),
      radial-gradient(40vmax 26vmax at 96% 106%, rgba(53,208,186,.22), transparent 64%);}
  .grid{position:absolute;inset:0;opacity:.5;pointer-events:none;
    background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),
                     linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);
    background-size:5vmin 5vmin;
    mask-image:radial-gradient(75% 75% at 50% 50%,#000 20%,transparent 100%);}
  .copy{position:relative;flex:1 1 auto;min-width:0;max-width:56%}
  .brand{display:flex;align-items:center;gap:2.4vmin;margin-bottom:4vmin}
  .mark{width:9vmin;height:9vmin;border-radius:999px;flex:none;
    background-image:linear-gradient(140deg,#5B8CFF,#35D0BA);
    display:grid;place-items:center;font-weight:800;color:#06100E;
    font-size:4.4vmin;letter-spacing:0;
    box-shadow:0 2vmin 5vmin -2vmin rgba(91,140,255,.75)}
  h1{font-size:7.4vmin;line-height:1;letter-spacing:.34vmin;font-weight:800;
     background-image:linear-gradient(140deg,#FFFFFF 30%,#9FC4FF 100%);
     -webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{font-size:2.5vmin;color:#8C97A8;letter-spacing:.5vmin;margin-top:1.6vmin;text-transform:uppercase}
  .tag{font-size:3.4vmin;line-height:1.6;color:#B9C4D4;margin-bottom:4vmin}
  .tag b{color:#fff;font-weight:600}
  .chips{display:flex;flex-wrap:wrap;gap:1.4vmin}
  .chip{font-size:2.4vmin;color:#C7E2FF;padding:1.1vmin 2.2vmin;border-radius:999px;
    border:.28vmin solid rgba(120,170,255,.28);background:rgba(91,140,255,.10);white-space:nowrap}
  .url{font-size:2.2vmin;color:#5E6878;margin-top:4.4vmin;letter-spacing:.1vmin}
  .phone{position:relative;flex:none;height:84vmin;
    border-radius:5vmin;overflow:hidden;
    border:.55vmin solid rgba(255,255,255,.10);
    box-shadow:0 6vmin 12vmin -6vmin rgba(0,0,0,.9), 0 0 0 .12vmin rgba(255,255,255,.05) inset}
  .phone img{display:block;height:100%;width:auto}
</style></head><body>
  <div class="grid"></div><div class="glow"></div>
  <div class="copy">
    <div class="brand"><div class="mark">O</div>
      <div><h1>O MY BEAT</h1><div class="sub">Rhythm &amp; Pitch Training</div></div>
    </div>
    <p class="tag"><b>打开即练的节奏训练游戏。</b><br>三种模式、四种曲风，48 小节阶梯提速。</p>
    <div class="chips">
      <span class="chip">鼓手 · 旋律家 · 节奏</span>
      <span class="chip">Straight / Swing / Bossa / Math Rock</span>
      <span class="chip">离线可玩</span>
    </div>
    <div class="url">aispin.github.io/o-beat</div>
  </div>
  <div class="phone"><img src="data:image/png;base64,${phone}" alt=""></div>
</body></html>`;

const dataUrl = `data:text/html;base64,${Buffer.from(card).toString('base64')}`;

console.log('og.png 1200×630');
await metrics(1200, 630, 1);
await send('Page.navigate', { url: dataUrl });
await sleep(1200);
await shot(path.join(PUBLIC, 'og.png'));

console.log('wide 1280×720');
await metrics(1280, 720, 1);
await send('Page.navigate', { url: dataUrl });
await sleep(1200);
await shot(path.join(PUBLIC, 'screenshots/wide-1280x720.png'));

ws.close();
proc.kill();
server.close();

// dist 里也放一份，省得为了三张图再跑一次完整构建
const OUT = [
  ['og.png', 'og.png'],
  ['screenshots/narrow-390x844.png', 'screenshots/narrow-390x844.png'],
  ['screenshots/wide-1280x720.png', 'screenshots/wide-1280x720.png'],
];
for (const [from, to] of OUT) {
  const dst = path.join(DIST, to);
  mkdirSync(path.dirname(dst), { recursive: true });
  writeFileSync(dst, readFileSync(path.join(PUBLIC, from)));
}

console.log('done');
process.exit(0);
