import { useCallback, useEffect, useState } from 'react';

/* 安装引导。
   Chrome 会在「满足安装条件」时抛出 beforeinstallprompt，但地址栏那个安装图标
   受用户档案状态影响（装过一次、点过忽略、企业策略都会让它不再出现），
   所以不能只依赖它 —— 这里把事件攥在自己手里，在设置里给一个确定存在的入口。

   事件必须在 React 挂载之前就开始监听：hydration 慢一点它就已经过去了，
   index.html 里的内联脚本负责先接住，这里只做读取。 */

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

export type InstallPlatform = 'chromium' | 'ios' | 'mac-safari' | 'installed' | 'unsupported';
export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

declare global {
  interface Window {
    __ombBIP?: BeforeInstallPromptEvent | null;
  }
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  // iOS Safari 的老属性，matchMedia 在部分版本上不可靠
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) return 'ios';
  // 桌面 Safari：没有 beforeinstallprompt，只能走菜单里的「添加到程序坞」
  if (/^((?!chrome|android|crios|edg).)*safari/i.test(ua)) return 'mac-safari';
  if ('onbeforeinstallprompt' in window || window.__ombBIP) return 'chromium';
  return 'unsupported';
}

export function useInstallPrompt() {
  const [installed, setInstalled] = useState(detectStandalone);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    () => window.__ombBIP ?? null,
  );

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      window.__ombBIP = e as BeforeInstallPromptEvent;
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      window.__ombBIP = null;
    };
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInstalled);
    // index.html 已经接住了事件的话，这里补一次
    if (window.__ombBIP) setDeferred(window.__ombBIP);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const platform: InstallPlatform = installed ? 'installed' : deferred ? 'chromium' : detectPlatform();

  const prompt = useCallback(async (): Promise<InstallOutcome> => {
    if (!deferred) return 'unavailable';
    try {
      await deferred.prompt();
    } catch {
      // 事件攥在手里太久，浏览器的用户手势已经过期了。
      // 这里不清掉 deferred —— 真实点击带着手势，下一次还能成。
      return 'unavailable';
    }
    const { outcome } = await deferred.userChoice;
    // 事件只能用一次，用完就得等下一次触发
    setDeferred(null);
    window.__ombBIP = null;
    if (outcome === 'accepted') setInstalled(true);
    return outcome;
  }, [deferred]);

  return { installed, canPrompt: !!deferred, platform, prompt };
}
