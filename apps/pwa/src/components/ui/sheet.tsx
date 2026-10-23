import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { DialogOverlay, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

/** 底部抽屉：设置面板。手机上从下往上推，手指够得着 */
function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal container={document.querySelector<HTMLElement>('.tw-root') ?? undefined}>
      <DialogOverlay className="bg-black/55" />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 max-h-[86vh] overflow-y-auto rounded-t-xl border-t border-border',
          'bg-popover px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-3 shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl sheet-panel',
          className,
        )}
        {...props}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/16" aria-hidden />
        {children}
        <DialogPrimitive.Close className="absolute right-5 top-5 rounded-full p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground">
          <X className="size-4" />
          <span className="sr-only">关闭</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, DialogTitle as SheetTitle, DialogDescription as SheetDescription };
