import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8'));

/** 构建版本号 = 版本 + 提交号 + 构建时间。
 *  版本发现的逻辑全靠它：新构建上线后 version.json 会变，老页面拉到不同的值就提示刷新。 */
function buildId() {
  let sha = 'nogit';
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    /* 没有 git（比如打包进 CI 的裸目录）就用时间戳兜底 */
  }
  return `${pkg.version}+${sha}.${Date.now().toString(36)}`;
}

const BUILD_ID = buildId();
const BUILD_TIME = new Date().toISOString();

/** SEO 的规范地址固定指向 GitHub Pages。
 *  原因：WorkBuddy 的分享域名要靠 ?sharecode 才能拿到 HTML，爬虫一律 403，
 *  那边根本不可能被索引；Pages 是唯一真正可爬的地址，重复内容统一归到这里。 */
const CANONICAL = 'https://aispin.github.io/o-beat/';
const OG_IMAGE = `${CANONICAL}og.png`;

/** WorkBuddy 的分享域名要靠 ?sharecode 才给 HTML，裸访问 / 是 403。
 *  Chrome 判定「可安装」时会去取 start_url，拿到 403 就不在地址栏给安装入口 ——
 *  这正是同一个包在 Pages 上有提示、在分享域名上没有的原因。
 *  发布到分享域名时把 sharecode 传进来，start_url 就会带上它。 */
const SHARECODE = process.env.OMB_SHARECODE || '';
const START_URL = SHARECODE ? `./?sharecode=${SHARECODE}` : '.';

/** 每次构建产出一个 version.json。
 *  它不进 precache（workbox 里排除），所以拉到的一定是服务器上的最新值。
 *  Service Worker 的 onNeedRefresh 只能发现「自己」的更新，
 *  被强缓存、或 SW 尚未激活时它可能完全不响 —— 这个文件是不依赖 SW 的兜底。 */
function versionFile(): Plugin {
  return {
    name: 'omb-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: pkg.version, buildId: BUILD_ID, time: BUILD_TIME }),
      });
    },
  };
}

/** SEO 产物 + HTML 里的占位符替换。
 *  robots.txt / sitemap.xml 只有在域名根目录才会被搜索引擎认，GitHub Pages 的项目页
 *  挂在 /o-beat/ 下，这两份文件目前是「先备着」：将来换成独立域名，把 CANONICAL 一改就生效。 */
function seoFiles(): Plugin {
  const today = BUILD_TIME.slice(0, 10);
  return {
    name: 'omb-seo',
    apply: 'build',
    transformIndexHtml(html) {
      return html
        .replaceAll('__CANONICAL__', CANONICAL)
        .replaceAll('__OG_IMAGE__', OG_IMAGE);
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: [
          'User-agent: *',
          'Allow: /',
          '',
          `Sitemap: ${CANONICAL}sitemap.xml`,
          '',
        ].join('\n'),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          '  <url>',
          `    <loc>${CANONICAL}</loc>`,
          `    <lastmod>${today}</lastmod>`,
          '    <changefreq>weekly</changefreq>',
          '    <priority>1.0</priority>',
          '  </url>',
          '</urlset>',
          '',
        ].join('\n'),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: mode === 'gh' ? '/o-beat/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  plugins: [
    react(),
    tailwindcss(),
    versionFile(),
    seoFiles(),
    VitePWA({
      // prompt：发现新版本时不自动接管，交给 UI 提示用户点「立即刷新」。
      // 游戏正在演奏时被强刷是最糟的体验，所以这里不能用 autoUpdate。
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '.',
        name: 'O My Beat',
        short_name: 'O My Beat',
        description: '节奏练习 · 音感训练',
        lang: 'zh-CN',
        dir: 'ltr',
        start_url: START_URL,
        scope: '.',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        background_color: '#07090D',
        theme_color: '#07090D',
        categories: ['games', 'music', 'education'],
        prefer_related_applications: false,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // 有 screenshots 才会弹「富安装」对话框（带界面预览），否则只是一条干巴巴的提示
        screenshots: [
          {
            src: 'screenshots/wide-1280x720.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: '首页：模式、音色、风格与 BPM',
          },
          {
            src: 'screenshots/narrow-390x844.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow',
            label: '演奏界面',
          },
        ],
      },
      workbox: {
        // 采样一共 312KB，直接进 precache：离线也能完整玩，不用等第二轮下载
        globPatterns: ['**/*.{js,css,svg,png,ico,mp3,woff2}'],
        // version.json 绝不能进缓存，否则「检查更新」永远拿到旧值；
        // 分享图和安装截图只有浏览器 UI 和社交爬虫会要，不占用户的离线配额
        globIgnores: ['**/version.json', '**/og.png', '**/screenshots/**'],
        /* HTML 不进 precache，导航走 NetworkFirst（见下面的 runtimeCaching）。
           把 index.html 也塞进 precache 是 PWA 更新最容易踩的坑：SW 会用缓存的旧壳
           响应导航，而旧壳引用的带 hash 的资源早随新构建删了 —— 用户看到的是白屏，
           或者「更新了但界面还是老的」，怎么刷新都没用。
           navigateFallback 必须一起关掉，否则它又会把导航固定回 precache 的 index。 */
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        /* 首次激活就接管当前页面：否则第一次访问的导航不会被 SW 拦截，
           换到只要带 ?sharecode 才给 HTML 的托管上，刷新一次就会掉进网关的错误页 */
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
            handler: 'NetworkFirst' as const,
            options: {
              cacheName: 'omb-html',
              // 3 秒拿不到就先用缓存顶上，地铁里也不会干等
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  // allowedHosts: 反向代理域名不在白名单时 Vite 会直接 403，线上预览必须放开
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: {
    /* 别写 es2022。依赖里带了 class static block（ES2022 才有的语法，Safari 16.4 起支持），
       target 设成 es2022 就等于告诉 esbuild「原样留着」，而微信内置浏览器跑的是系统
       WKWebView —— iOS 16.3 的 Safari 16.3 不认识 `static {}`，整个包在模块解析阶段就抛
       `Unexpected token '{'`，页面全黑。压到 safari15 逼 esbuild 把它降级。 */
    target: ['es2020', 'safari15'],
    assetsInlineLimit: 4096,
    /* 每次构建都清干净 dist。曾经试过 emptyOutDir:false 来保住旧 hash 的资源，
       但 Workbox 会把残留文件一起打进 precache —— 包体从 861KB 直接涨到 2.2MB。
       旧 HTML 的问题改在服务端解决：serve.py 给 HTML/JSON 发 no-store，资源发长缓存。 */
    emptyOutDir: true,
  },
}));
