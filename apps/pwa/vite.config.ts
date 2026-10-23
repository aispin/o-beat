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
    VitePWA({
      // prompt：发现新版本时不自动接管，交给 UI 提示用户点「立即刷新」。
      // 游戏正在演奏时被强刷是最糟的体验，所以这里不能用 autoUpdate。
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'O My Beat',
        short_name: 'O My Beat',
        description: '节奏练习 · 音感训练',
        lang: 'zh-CN',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#07090D',
        theme_color: '#07090D',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 采样一共 312KB，直接进 precache：离线也能完整玩，不用等第二轮下载
        globPatterns: ['**/*.{js,css,html,svg,png,ico,mp3,woff2}'],
        // version.json 绝不能进缓存，否则「检查更新」永远拿到旧值
        globIgnores: ['**/version.json'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  // allowedHosts: 反向代理域名不在白名单时 Vite 会直接 403，线上预览必须放开
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: { target: 'es2022', assetsInlineLimit: 4096 },
}));
