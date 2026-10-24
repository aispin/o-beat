import { Download } from 'lucide-react';

import { TopNotice } from '@/components/TopNotice';

/** 新版本提示条。 */
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
    <TopNotice
      icon={<Download className="size-3.5" />}
      title="有新版本"
      desc="刷新后生效，正在进行的对局会结束"
      secondary="稍后"
      primary="立即刷新"
      onSecondary={onDismiss}
      onPrimary={onApply}
    />
  );
}
