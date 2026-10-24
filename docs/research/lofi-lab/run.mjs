import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = Number(process.env.LAB_CDP_PORT || 9413);
const HTTP = process.env.LAB_HTTP || 'http://127.0.0.1:8899';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const cases = process.argv.slice(2);
if (!cases.length) {
  console.error('usage: node run.mjs case1 case2 ...');
  process.exit(1);
}

const child = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/omb-lofi-profile',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('chrome not ready');
}

const page = await findPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) rej(new Error(JSON.stringify(msg.error)));
    else res(msg.result);
  }
};
function send(method, params = {}) {
  const mid = ++id;
  return new Promise((res, rej) => {
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}

async function evaluate(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', {
    expression, awaitPromise, returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description || ''));
  return r.result.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: `${HTTP}/docs/research/lofi-lab/` });

for (let i = 0; i < 80; i++) {
  const ok = await evaluate('window.__ready === true').catch(() => false);
  if (ok) break;
  await sleep(200);
}

for (const name of cases) {
  const t0 = Date.now();
  const r = await evaluate(`window.renderCase(${JSON.stringify(name)})`, true);
  const file = `${OUT}/${name}.wav`;
  writeFileSync(file, Buffer.from(r.b64, 'base64'));
  console.log(`${name}  ${r.dur.toFixed(2)}s  render ${r.ms}ms  total ${Date.now() - t0}ms`);
}

ws.close();
child.kill('SIGKILL');
