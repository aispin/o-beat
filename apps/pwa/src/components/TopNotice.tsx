import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/** 顶部提示条的通用壳子。
 *  固定在顶部而不是遮挡底部的「开始练习」—— 这类提示不该挡住主操作。
 *  演奏中不弹（正在打的时候弹窗最烦人），等回到首页再出现。 */
export function TopNotice({
  icon,
  title,
  desc,
  secondary,
  primary,
  onSecondary,
  onPrimary,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  secondary: string;
  primary: string;
  onSecondary: () => void;
  onPrimary: () => void;
}) {
  return (
    <div className="pointer-events-auto fixed inset-x-0 top-0 z-40 px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)]">
      <div className="glass flex items-center gap-3 rounded-md px-3 py-2.5 shadow-lg">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-[12.5px] font-medium">{title}</b>
          <em className="mt-0.5 block truncate text-[10.5px] not-italic text-text-dim">{desc}</em>
        </div>
        <Button variant="ghost" size="sm" onClick={onSecondary}>
          {secondary}
        </Button>
        <Button size="sm" onClick={onPrimary}>
          {primary}
        </Button>
      </div>
    </div>
  );
}
