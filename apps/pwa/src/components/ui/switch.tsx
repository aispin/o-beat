import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

import { cn } from '@/lib/utils';

/** 开关：轨迹用品牌色，拇指白色。尺寸按 4px 网格（44×26，拇指 20） */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-[26px] w-11 shrink-0 items-center rounded-full border-0 p-[3px] transition-colors',
        'bg-white/12 data-[state=checked]:bg-primary',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-white shadow-sm transition-transform',
          'data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
