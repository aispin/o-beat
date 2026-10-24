import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { HomeScreen } from '@/components/HomeScreen';
import { PauseDialog } from '@/components/PauseDialog';
import { PlayOverlay } from '@/components/PlayOverlay';
import { Props } from '@/components/Props';
import { ResultScreen } from '@/components/ResultScreen';
import { SettingsSheet } from '@/components/SettingsSheet';
import { UpdateBar } from '@/components/UpdateBar';
import { Toaster } from '@/components/ui/sonner';
import { game } from '@/engine';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { useGame } from '@/hooks/useGame';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { storage } from '@/lib/storage';

const INSTALL_DISMISSED = 'omb.installPromptDismissed';

export default function App() {
  const snap = useGame();
  const glRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLCanvasElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dismissedBuild, setDismissedBuild] = useState<string | null>(null);
  const [installDismissed, setInstallDismissed] = useState(
    () => storage.get(INSTALL_DISMISSED) === '1',
  );

  const update = useAppUpdate();
  const install = useInstallPrompt();

  useEffect(() => {
    // 首屏的呼吸 O 交给这里退场：effect 在首帧提交之后才跑，不会闪一下黑
    document.getElementById('boot')?.remove();
    // 告诉 index.html 里的看门狗「界面起来了」，它就不会再弹兜底面板
    document.documentElement.dataset.omb = 'ready';
    if (!glRef.current || !stageRef.current) return;
    game.boot({ stage: stageRef.current, glbg: glRef.current });
  }, []);

  const inRun = snap.phase === 'playing' || snap.phase === 'paused';
  const showUpdate = update.updateReady && !inRun && dismissedBuild !== update.latest + '';
  const showInstall = !install.installed && install.canPrompt && !installDismissed;

  const onInstall = async () => {
    const outcome = await install.prompt();
    if (outcome === 'dismissed') {
      // 用户在系统弹窗里点了取消：别再来烦他，入口还留在设置里
      setInstallDismissed(true);
      storage.set(INSTALL_DISMISSED, '1');
    }
    if (outcome === 'accepted') toast('装好了', { description: '下次从桌面图标启动，直接进游戏。' });
    if (outcome === 'unavailable') {
      toast('浏览器这会儿不接受安装请求', {
        description: '试试地址栏右侧的安装图标，或者从浏览器菜单里选「安装 O My Beat」。',
      });
    }
  };

  return (
    <div className="tw-root app-shell" data-scene={snap.scene} data-scene-off={!snap.sceneOn}>
      <canvas ref={glRef} className="gl-bg" />
      <Props scene={snap.scene} enabled={snap.sceneOn} />
      <div className="veil" />

      <canvas
        ref={stageRef}
        className="stage"
        onPointerDown={(e) => {
          e.preventDefault();
          game.press(e.clientX, e.pointerId);
        }}
      />

      {snap.phase === 'home' ? (
        <HomeScreen
          snap={snap}
          onOpenSettings={() => setSettingsOpen(true)}
          showInstall={showInstall}
          onInstall={onInstall}
        />
      ) : null}

      {snap.phase === 'result' ? <ResultScreen snap={snap} /> : null}

      <PlayOverlay snap={snap} onPause={() => game.pause()} />

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        snap={snap}
        update={update}
        install={install}
      />
      <PauseDialog snap={snap} />
      <UpdateBar
        show={showUpdate}
        onApply={update.apply}
        onDismiss={() => setDismissedBuild(update.latest + '')}
      />
      <Toaster />
    </div>
  );
}
