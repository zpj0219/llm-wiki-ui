import { ChevronRight } from 'lucide-react';
import { normPath } from '@/lib/utils';

type WikiPathBreadcrumbProps = {
  relPath: string;
  onNavigatePrefix?: (prefix: string) => void;
};

export function WikiPathBreadcrumb({ relPath, onNavigatePrefix }: WikiPathBreadcrumbProps) {
  const parts = normPath(relPath).split('/').filter(Boolean);

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground min-w-0 flex-wrap">
      {parts.map((part, i) => {
        const prefix = parts.slice(0, i + 1).join('/');
        const isLast = i === parts.length - 1;
        return (
          <span key={prefix} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
            {isLast ? (
              <span className="text-foreground font-medium truncate">{part}</span>
            ) : (
              <button
                type="button"
                className="hover:text-foreground hover:underline truncate"
                onClick={() => onNavigatePrefix?.(prefix)}
              >
                {part}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
