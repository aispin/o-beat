import { spawn } from 'node:child_process';
import fs from 'node:fs';

/* 图标生成：把 favicon.svg 用无头 Chrome 渲染成各尺寸 PNG。
   不引图形库，公式和原型里那颗 Logo 完全一致（同心双圆 = 一个 O）。 */

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9431;
const svg = fs.readFileSync('public/favicon.svg', 'utf8');

const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs><linearGradient id="g" x1="0.15" y1="0" x2="0.85" y2="1">
    <stop offset="0" stop-color="#5B8CFF"/><stop offset="1" stop-color="#35D0BA"/>
  </linearGradient></defs>
  <rect width="512" height="512" fill="#07090D"/>
  <circle cx="256" cy="256" r="118" fill="url(#g)"/>
  <circle cx="256" cy="256" r="61" fill="#07090D"/>
</svg>`;

const jobs = [
  { size: 192, svg, out: 'public/icons/icon-192.png' },
  { size: 512, svg, out: 'public/icons/icon-512.png' },
  { size: 512, svg: maskable, out: 'public/icons/icon-512-maskable.png' },
  { size: 180, svg, out: 'public/icons/apple-touch-icon.png' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=/tmp/omb-icon',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let list = [];
for (let i = 0; i < 80; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
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
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send('Page.enable');

for (const job of jobs) {
  const html = `<!doctype html><html><body style="margin:0;background:#07090D">
  <div style="width:${job.size}px;height:${job.size}px;overflow:hidden">${job.svg.replace(
    'width="512" height="512"',
    `width="${job.size}" height="${job.size}"`,
  )}</div></body></html>`;
  await send('Emulation.setDeviceMetricsOverride', {
    width: job.size,
    height: job.size,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) });
  await sleep(320);
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: job.size, height: job.size, scale: 1 },
  });
  fs.mkdirSync('public/icons', { recursive: true });
  fs.writeFileSync(job.out, Buffer.from(shot.result.data, 'base64'));
  console.log('wrote', job.out, job.size);
}

ws.close();
proc.kill();
process.exit(0);
