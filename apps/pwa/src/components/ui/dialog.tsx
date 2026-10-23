import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

/* 弹层默认挂到 body，会跑出 .tw-root 之外，scoped preflight 就管不到它了。
   统一挂回 .tw-root，层级与基础样式才和页面一致。 */
function twRoot() {
  return document.querySelector<HTMLElement>('.tw-root') ?? undefined;
}

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/62 backdrop-blur-[2px] overlay-in',
        className,
      )}
      {...props}
    />
  );
}

/** 居中弹窗：暂停、确认这类「打断当前动作」的场合 */
function DialogContent({
  className,
  children,
  showClose = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showClose?: boolean }) {
  return (
    <DialogPortal container={twRoot()}>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100%-40px)] max-w-[360px] -translate-x-1/2 -translate-y-1/2',
          'rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-2xl dialog-in',
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground">
            <X className="size-4" />
            <span className="sr-only">关闭</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-base font-semibold tracking-wide', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('mt-2 text-[13px] leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogTitle,
  DialogDescription,
};
