import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/* 版本发现有三条独立的信号，任意一条命中就说明「服务器上是新的」：
   1. Service Worker 的 onNeedRefresh —— 最准，但只有 SW 自己换了字节才知道；
   2. version.json —— 不依赖 SW，被强缓存 / SW 未激活时也能发现；
   3. 页面重新可见（切回来、从后台唤醒）—— 顺手再查一次，不额外花钱。
   三者统一成一个 updateReady，UI 只认这一个开关。 */

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 分钟
const VERSION_URL = `${import.meta.env.BASE_URL}version.json`;

export interface UpdateState {
  updateReady: boolean;
  checking: boolean;
  /** 服务器上那版的 id，给设置页显示「有新版本 v0.1.0+abc123」 */
  latest: string | null;
  /** 手动检查过一次之后才有值：'latest' | 'stale' */
  manualResult: 'latest' | 'stale' | null;
  apply: () => void;
  check: (manual?: boolean) => Promise<'latest' | 'stale'>;
}

interface VersionFile {
  version: string;
  buildId: string;
  time: string;
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
  const [manualResult, setManualResult] = useState<'latest' | 'stale' | null>(null);
  const busy = useRef(false);

  const check = useCallback(async (manual = false) => {
    if (busy.current) return manualResult ?? 'latest';
    busy.current = true;
    if (manual) setChecking(true);
    try {
      const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return manualResult ?? 'latest';
      const data = (await res.json()) as VersionFile;
      const stale = data.buildId !== __BUILD_ID__;
      setFileUpdate(stale ? data.buildId : null);
      const verdict = stale ? 'stale' : 'latest';
      if (manual) setManualResult(verdict);
      return verdict;
    } catch {
      /* 离线：拿不到就是没有新版本，不打扰用户 */
      return manualResult ?? 'latest';
    } finally {
      busy.current = false;
      if (manual) setChecking(false);
    }
  }, [manualResult]);

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
