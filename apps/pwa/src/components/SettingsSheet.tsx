import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { game, type GameSnapshot, type Settings } from '@/engine';
import { cn } from '@/lib/utils';

function Row({
  label,
  hint,
  children,
  dim,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  dim?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 border-b border-border py-3.5 last:border-b-0',
        dim && 'opacity-30',
      )}
    >
      <div className="min-w-0">
        <b className="block text-[13.5px] font-medium">{label}</b>
        {hint ? <em className="mt-0.5 block text-[11px] not-italic text-text-dim">{hint}</em> : null}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">{children}</div>
    </div>
  );
}

export function SettingsSheet({
  open,
  onOpenChange,
  snap,
  update,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  snap: GameSnapshot;
  update: {
    checking: boolean;
    check: (manual?: boolean) => Promise<'latest' | 'stale'>;
    apply: () => void;
  };
}) {
  const s: Settings = snap.settings;
  const rhythm = snap.mode === 'rhythm';
  const [version, sha] = __BUILD_ID__.split('+');

  const onCheck = async () => {
    const verdict = await update.check(true);
    if (verdict === 'stale') {
      toast('有新版本可用', {
        description: '刷新后生效，正在进行的对局会结束。',
        action: { label: '刷新', onClick: update.apply },
        duration: 8000,
      });
    } else {
      toast('已经是最新版本', { description: `v${version}${sha ? ` · ${sha.split('.')[0]}` : ''}` });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby={undefined}>
        <div className="mb-1 flex items-center justify-between">
          <SheetTitle className="text-[15px]">设置</SheetTitle>
        </div>
        <SheetDescription className="mb-2 text-[11px]">
          改动即时生效，下一次演奏应用
        </SheetDescription>

        <Row label="音符速度" hint="越大越快" dim={rhythm}>
          <Slider
            className="w-32"
            min={1.2}
            max={2.5}
            step={0.1}
            value={[s.lookahead]}
            disabled={rhythm}
            onValueChange={([v]) => game.setSettings({ lookahead: v })}
          />
          <span className="w-9 text-right text-[12px] tabular-nums text-muted-foreground">
            {s.lookahead.toFixed(1)}s
          </span>
        </Row>

        <Row label="判定偏移" hint="偏早为负">
          <Slider
            className="w-32"
            min={-150}
            max={150}
            step={5}
            value={[s.offset]}
            onValueChange={([v]) => game.setSettings({ offset: v })}
          />
          <span className="w-9 text-right text-[12px] tabular-nums text-muted-foreground">
            {s.offset}ms
          </span>
        </Row>

        <Row label="PAD 轨" hint="关闭后只剩旋律" dim={snap.mode !== 'melodist'}>
          <Switch
            checked={s.padOn}
            disabled={snap.mode !== 'melodist'}
            onCheckedChange={(v) => game.setSettings({ padOn: v })}
          />
        </Row>

        <Row label="音高判定" hint="关闭后退化为纯节奏" dim={snap.mode !== 'melodist'}>
          <Switch
            checked={s.pitchJudge}
            disabled={snap.mode !== 'melodist'}
            onCheckedChange={(v) => game.setSettings({ pitchJudge: v })}
          />
        </Row>

        <Row label="场景" hint="随曲目自动切换">
          <Switch checked={s.sceneOn} onCheckedChange={(v) => game.setSettings({ sceneOn: v })} />
        </Row>

        <Row label="音效" hint="击打音与伴奏">
          <Switch checked={s.sound} onCheckedChange={(v) => game.setSettings({ sound: v })} />
        </Row>

        <div className="mt-4 rounded-md border border-border bg-white/[0.03] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <b className="block text-[12px] font-medium tabular-nums">
                v{version}
                {sha ? <span className="text-text-dim"> · {sha.split('.')[0]}</span> : null}
              </b>
              <em className="mt-0.5 block text-[10.5px] not-italic text-text-dim">
                构建于 {new Date(__BUILD_TIME__).toLocaleString('zh-CN', { hour12: false })}
              </em>
            </div>
            <Button variant="outline" size="sm" onClick={onCheck} disabled={update.checking}>
              <RefreshCw className={cn('size-3.5', update.checking && 'animate-spin')} />
              {update.checking ? '检查中' : '检查更新'}
            </Button>
          </div>
        </div>


      </SheetContent>
    </Sheet>
  );
}
