import { Toaster as Sonner, type ToasterProps } from 'sonner';

/** 全局 toast。规范：toast 一律用 sonner，不用已废弃的 <Toast /> */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      offset={16}
      toastOptions={{
        classNames: {
          toast:
            'glass !rounded-md !text-foreground !text-[13px] !px-4 !py-3 !border-line-strong',
          description: '!text-muted-foreground',
          actionButton: 'brand-fill !text-[#06100E] !font-semibold',
        },
      }}
      {...props}
    />
  );
}
