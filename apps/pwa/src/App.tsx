import { useEffect, useRef, useState } from 'react';

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

export default function App() {
  const snap = useGame();
  const glRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLCanvasElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dismissedBuild, setDismissedBuild] = useState<string | null>(null);

  const update = useAppUpdate();

  useEffect(() => {
    if (!glRef.current || !stageRef.current) return;
    game.boot({ stage: stageRef.current, glbg: glRef.current });
  }, []);

  const inRun = snap.phase === 'playing' || snap.phase === 'paused';
  const showUpdate = update.updateReady && !inRun && dismissedBuild !== update.latest + '';

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
        <HomeScreen snap={snap} onOpenSettings={() => setSettingsOpen(true)} />
      ) : null}

      {snap.phase === 'result' ? <ResultScreen snap={snap} /> : null}

      <PlayOverlay snap={snap} onPause={() => game.pause()} />

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        snap={snap}
        update={update}
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
