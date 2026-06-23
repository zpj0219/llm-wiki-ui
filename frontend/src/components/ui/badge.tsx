import { cn } from '@/lib/utils';

function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'secondary' | 'outline' }) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors',
        variant === 'default' && 'border-transparent bg-primary text-primary-foreground',
        variant === 'secondary' && 'border-transparent bg-secondary text-secondary-foreground',
        variant === 'outline' && 'text-foreground',
        className
      )}
      {...props}
    />
  );
}

export { Badge };
