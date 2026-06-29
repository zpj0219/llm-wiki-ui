import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: 'left' | 'right';
  children: React.ReactNode;
};

export function Sheet({ open, onOpenChange, side = 'left', children }: SheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div
        className={cn(
          'fixed top-0 h-full w-[var(--sidebar-width)] max-w-[85vw] bg-card shadow-xl border-r animate-in slide-in-from-left duration-200',
          side === 'right' && 'right-0 border-l border-r-0 slide-in-from-right'
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between px-4 py-3 border-b', className)} {...props}>
      {children}
    </div>
  );
}

export function SheetTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-sm font-semibold', className)} {...props}>{children}</h2>;
}

export function SheetClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="rounded-md p-1 hover:bg-accent transition-colors"
    >
      <X className="h-4 w-4" />
      <span className="sr-only">关闭</span>
    </button>
  );
}
