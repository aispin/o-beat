import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';

/** 新版本提示条。
 *  放在顶部而不是遮挡底部的「开始练习」—— 更新不该挡住主操作。
 *  演奏中不弹（正在打的时候弹窗最烦人），等回到首页再出现。 */
export function UpdateBar({
  show,
  onApply,
  onDismiss,
}: {
  show: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  if (!show) return null;
  return (
    <div className="pointer-events-auto fixed inset-x-0 top-0 z-40 px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)]">
      <div className="glass flex items-center gap-3 rounded-md px-3 py-2.5 shadow-lg">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
          <Download className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-[12.5px] font-medium">有新版本</b>
          <em className="mt-0.5 block truncate text-[10.5px] not-italic text-text-dim">
            刷新后生效，正在进行的对局会结束
          </em>
        </div>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          稍后
        </Button>
        <Button size="sm" onClick={onApply}>
          立即刷新
        </Button>
      </div>
    </div>
  );
}
