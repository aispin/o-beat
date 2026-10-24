import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/* 版本发现有三条独立的信号，任意一条命中就说明「服务器上是新的」：
   1. Service Worker 的 onNeedRefresh —— 最准，sw.js 换了字节它就响；
   2. version.json —— 不依赖 SW，被强缓存 / SW 未激活时也能发现；
   3. 页面重新可见（切回来、从后台唤醒）—— 顺手再查一次，不额外花钱。
   三者统一成一个 updateReady，UI 只认这一个开关。

   注意 version.json 不是到处都能拿到：WorkBuddy 的分享域名只放行 sw.js / manifest /
   图标这几个 PWA 必需的路径，其余一律 403。所以它只能当「锦上添花」，
   真正兜底的判断是手动检查时顺带 reg.update() 一次。 */

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 分钟
const SW_WAIT = 3000; // 手动检查时等 SW 自报更新的上限

export type UpdateVerdict = 'latest' | 'stale' | 'unknown';

export interface UpdateState {
  updateReady: boolean;
  checking: boolean;
  /** 服务器上那版的 id，给设置页显示「有新版本 v0.1.0+abc123」 */
  latest: string | null;
  /** 手动检查过一次之后才有值 */
  manualResult: UpdateVerdict | null;
  apply: () => void;
  check: (manual?: boolean) => Promise<UpdateVerdict>;
}

interface VersionFile {
  version: string;
  buildId: string;
  time: string;
}

/** 探针地址要保住 sharecode：分享域名靠它才放行，
 *  顺手加的 t= 一旦把它顶掉，拿到的就是网关那张 403 的 HTML。 */
function versionUrl(): string {
  const url = new URL(`${import.meta.env.BASE_URL}version.json`, location.href);
  const sharecode = new URLSearchParams(location.search).get('sharecode');
  if (sharecode) url.searchParams.set('sharecode', sharecode);
  url.searchParams.set('t', Date.now().toString(36));
  return url.toString();
}

async function probeVersionFile(): Promise<VersionFile | null> {
  try {
    const res = await fetch(versionUrl(), { cache: 'no-store' });
    if (!res.ok) return null;
    if (!(res.headers.get('content-type') || '').includes('json')) return null;
    const data = (await res.json()) as VersionFile;
    return typeof data?.buildId === 'string' ? data : null;
  } catch {
    /* 离线、跨域、被网关挡下：都当「这条信号不存在」，不打扰用户 */
    return null;
  }
}

export function useAppUpdate(): UpdateState {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // 主动轮询 SW 更新：浏览器自己只在导航时查，App 长期开着就永远发现不了
      if (!registration) return;
      setInterval(() => registration.update().catch(() => {}), CHECK_INTERVAL);
    },
  });

  const [fileUpdate, setFileUpdate] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [manualResult, setManualResult] = useState<UpdateVerdict | null>(null);
  const busy = useRef(false);
  const needRefreshRef = useRef(needRefresh);
  needRefreshRef.current = needRefresh;

  const check = useCallback(async (manual = false): Promise<UpdateVerdict> => {
    if (busy.current) return 'unknown';
    busy.current = true;
    if (manual) setChecking(true);
    try {
      const file = await probeVersionFile();
      if (file) {
        const stale = file.buildId !== __BUILD_ID__;
        setFileUpdate(stale ? file.buildId : null);
        const verdict: UpdateVerdict = stale ? 'stale' : 'latest';
        if (manual) setManualResult(verdict);
        return verdict;
      }

      // version.json 拿不到（分享域名会 403）就退回到 SW：让它自己去比 sw.js
      const reg = await navigator.serviceWorker?.getRegistration().catch(() => null);
      if (!reg) {
        if (manual) setManualResult('unknown');
        return 'unknown';
      }
      await reg.update().catch(() => {});
      let verdict: UpdateVerdict = 'latest';
      for (let waited = 0; waited < SW_WAIT; waited += 300) {
        if (needRefreshRef.current) {
          verdict = 'stale';
          break;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      if (manual) setManualResult(verdict);
      return verdict;
    } finally {
      busy.current = false;
      if (manual) setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check(false);
    const timer = setInterval(() => void check(false), CHECK_INTERVAL);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  const apply = useCallback(() => {
    // 先让 SW 接管新版本，再刷新。没有 SW（比如 http 环境）就直接 reload
    updateServiceWorker(true).catch(() => location.reload());
  }, [updateServiceWorker]);

  return {
    updateReady: needRefresh || !!fileUpdate,
    checking,
    latest: fileUpdate,
    manualResult,
    apply,
    check,
  };
}

export const BUILD_ID = __BUILD_ID__;
export const APP_VERSION = __APP_VERSION__;
export const BUILD_TIME = __BUILD_TIME__;
