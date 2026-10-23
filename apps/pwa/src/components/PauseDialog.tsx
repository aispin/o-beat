import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { game, type GameSnapshot } from '@/engine';

export function PauseDialog({ snap }: { snap: GameSnapshot }) {
  const open = snap.phase === 'paused';
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? undefined : game.resume())}>
      <DialogContent aria-describedby={undefined} className="text-center">
        <DialogTitle className="text-[15px]">已暂停</DialogTitle>
        <DialogDescription className="sr-only">选择继续或结束本局</DialogDescription>
        <div className="mt-5 space-y-2.5">
          <Button size="cta" onClick={() => game.resume()}>
            继续
          </Button>
          <Button size="lg" variant="outline" className="w-full" onClick={() => game.quit()}>
            结束本局
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
