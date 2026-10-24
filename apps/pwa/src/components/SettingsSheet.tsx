import type { ReactNode } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { game, type GameSnapshot, type Settings } from '@/engine';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { cn } from '@/lib/utils';

const INSTALL_HINT = {
  installed: '从桌面图标启动即为独立窗口',
  chromium: '离线可玩，不再占用浏览器标签',
  ios: 'Safari：分享 → 添加到主屏幕',
  'mac-safari': 'Safari：文件 → 添加到程序坞',
  unsupported: '当前浏览器不支持，请用 Chrome / Edge 打开',
} as const;

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
  install,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  snap: GameSnapshot;
  update: {
    checking: boolean;
    check: (manual?: boolean) => Promise<'latest' | 'stale' | 'unknown'>;
    apply: () => void;
  };
  install: ReturnType<typeof useInstallPrompt>;
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
    } else if (verdict === 'unknown') {
      toast('暂时检查不了', {
        description: '当前托管不开放版本文件，下次打开应用时会自动再试。',
      });
    } else {
      toast('已经是最新版本', { description: `v${version}${sha ? ` · ${sha.split('.')[0]}` : ''}` });
    }
  };

  const onInstall = async () => {
    const outcome = await install.prompt();
    if (outcome === 'dismissed') toast('已取消安装');
    if (outcome === 'unavailable') toast('浏览器这会儿不接受安装请求', { description: '过一会儿再试，或直接用地址栏右侧的安装图标。' });
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

        <Row label="背景音乐" hint="8bit 循环，演奏时自动静音">
          <Switch checked={s.bgm} onCheckedChange={(v) => game.setSettings({ bgm: v })} />
        </Row>

        {/* 地址栏那个安装图标受用户档案状态影响（装过、点过忽略、策略限制都会让它不再出现），
            所以给一个我们自己控制得了的入口 */}
        <div className="mt-4 rounded-md border border-border bg-white/[0.03] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <b className="block text-[12px] font-medium">
                {install.installed ? '已安装到桌面' : '安装到桌面'}
              </b>
              <em className="mt-0.5 block text-[10.5px] not-italic text-text-dim">
                {INSTALL_HINT[install.platform]}
              </em>
            </div>
            {!install.installed && install.canPrompt ? (
              <Button variant="outline" size="sm" onClick={onInstall}>
                <Download className="size-3.5" />
                安装
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-2 rounded-md border border-border bg-white/[0.03] px-4 py-3">
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
