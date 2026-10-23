import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/* 按钮系统。规则见 spec-ui.md §5.6：
   变体按语义选，调用处只许调布局类，不许覆写颜色/高度/字号。
   尺寸偏离了规范里的 28px —— 这里是移动端游戏，主按钮是「开始练习」这种
   单手大目标，54px 才有手感。新增尺寸一律加在这个文件里，不在页面拼类名。 */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap border-0 font-medium ' +
    'transition-[background-color,border-color,color,transform,filter] duration-200 ' +
    'outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ' +
    'disabled:pointer-events-none disabled:bg-secondary disabled:text-muted-foreground ' +
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 active:scale-[0.985]",
  {
    variants: {
      variant: {
        /* 主操作：品牌渐变，整屏只有一颗 */
        default: 'brand-fill brand-glow text-[#06100E] hover:brightness-105',
        /* 次要操作：描边 */
        outline:
          'border border-line-strong bg-white/[0.03] text-foreground hover:bg-white/[0.07]',
        /* 低频 / 行内：无边框，hover 给品牌浅底 */
        ghost: 'text-muted-foreground hover:bg-primary/12 hover:text-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-white/[0.12]',
        destructive: 'bg-destructive text-destructive-foreground hover:brightness-105',
      },
      size: {
        sm: 'h-8 rounded-sm px-3 text-xs',
        default: 'h-9 rounded-sm px-4 text-sm',
        lg: 'h-[52px] rounded-md px-5 text-[15px] font-semibold tracking-[2px]',
        cta: 'h-[54px] w-full rounded-md px-5 text-base font-bold tracking-[3px]',
        icon: 'size-9 rounded-full',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
