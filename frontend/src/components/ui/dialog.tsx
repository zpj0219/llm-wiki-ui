import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  /** 叠层顺序，默认 50 */
  zIndex?: number;
  /** 是否渲染半透明遮罩，默认 true */
  showBackdrop?: boolean;
};

export function Dialog({
  open,
  onOpenChange,
  children,
  className,
  zIndex = 50,
  showBackdrop = true,
}: DialogProps) {
  // 父组件每帧重渲时 onOpenChange 常是新引用；用 ref 避免 effect 反复装卸
  const onOpenChangeRef = React.useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChangeRef.current(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex }}>
      {showBackdrop ? (
        <button
          type="button"
          className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
          aria-label="关闭"
          onClick={() => onOpenChange(false)}
        />
      ) : (
        // 下层弹窗：透明拦截层，不叠加颜色；点击不关闭（只关顶层）
        <div className="absolute inset-0 bg-transparent" aria-hidden />
      )}
      <div className={cn('relative z-10 w-full max-w-lg', className)}>{children}</div>
    </div>
  );
}

export function DialogContent({
  className,
  children,
  onClose,
}: {
  className?: string;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        'relative flex max-h-[min(92vh,720px)] flex-col overflow-hidden',
        'rounded-xl border border-border bg-card shadow-lg',
        className
      )}
      role="dialog"
      aria-modal="true"
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex shrink-0 flex-col gap-1.5 p-6 pb-4 pr-12', className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-semibold leading-none', className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // 占据 header/footer 之间的剩余高度；内容过多时在 body 内滚动，保证 footer 始终完整可见。
        'min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 pb-4',
        className
      )}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col-reverse sm:flex-row sm:justify-end gap-2',
        'border-t border-border bg-muted/30 px-6 py-4',
        className
      )}
      {...props}
    />
  );
}
