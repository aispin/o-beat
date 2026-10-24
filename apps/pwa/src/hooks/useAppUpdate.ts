import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/* 版本发现有三条独立的信号，任意一条命中就说明「服务器上是新的」：
   1. Service Worker 的 onNeedRefresh —— 最准，sw.js 换了字节它就响；
   2. version.json —— 不依赖 SW，被强缓存 / SW 未激活时也能发现；
   3. 页面重新可见（切回来、从后台唤醒）—— 顺手再查一次，不额外花钱。
   三者统一成一个 updateReady，UI 只认这一个开关。

   注意 version.json 在分享域名上不是默认就能拿到的：网关按 URL 上的 ?sharecode= 放行，
   页面首次访问后虽然会种 __wb_rsc Cookie，但探针请求必须自己把 sharecode 带上
   （见下面的 versionUrl），否则回来的是网关那张 403 的 HTML。 */

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
        /* buildId 不同还不算数：CDN 回滚到上一版时它也不一样，照着提示会把人往下拽。
           再加上「远端构建时间不早于本地」这个条件，只在真的更新时才亮提示。 */
        const remoteAt = Date.parse(file.time);
        const stale =
          file.buildId !== __BUILD_ID__ &&
          (Number.isNaN(remoteAt) || remoteAt >= Date.parse(__BUILD_TIME__));
        setFileUpdate(stale ? file.buildId : null);
        const verdict: UpdateVerdict = stale ? 'stale' : 'latest';
        if (manual) setManualResult(verdict);
        return verdict;
      }

      // 探针彻底拿不到（离线 / 网关抽风）就退回到 SW：让它自己去比 sw.js
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

  const apply = useCallback(async () => {
    /* 三步推倒重来，不要图省事只调 updateServiceWorker(true)：
       ① 它只给「正在 waiting」的 SW 发 SKIP_WAITING。而我们的 updateReady 有两条来源，
          version.json 那条命中时根本没有 waiting worker —— 于是点了按钮什么都不会发生，
          这就是「点更新没反应」的由来。
       ② 它不清 Cache Storage，新 SW 会原样继承旧运行时缓存，刷新后仍是老内容。
       ③ 它依赖 controllerchange 的时序，iOS Safari 上并不总是可靠。
       清缓存 → 注销 SW → 强制刷新，三步走完就不依赖任何时序了。 */
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* 缓存删不掉也继续，刷新是最后兜底 */
    }
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {
      /* 同上 */
    }
    /* 分享域名的 CDN 会把 HTML 缓存很久，裸 reload 拿到的还是旧壳。
       带一个一次性参数才回源，App 挂载后会把它从地址栏摘掉。 */
    try {
      const u = new URL(location.href);
      u.searchParams.set('_r', Date.now().toString(36));
      location.replace(u.toString());
    } catch {
      location.reload();
    }
  }, []);

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
