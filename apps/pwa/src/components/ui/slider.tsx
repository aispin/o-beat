import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '@/lib/utils';

/** 滑杆：设置面板里的「音符速度」「判定偏移」。轨道细、拇指大，手指好按 */
function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        'relative flex w-full touch-none select-none items-center',
        'data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1 w-full grow overflow-hidden rounded-full bg-white/12"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full brand-fill"
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        className="block size-4 rounded-full border-2 border-background bg-foreground shadow-md outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-110"
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
