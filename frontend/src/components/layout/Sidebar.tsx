import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PAGES, PAGE_LABELS, type PageId } from '@shared/constants';

type SidebarProps = {
  currentPage: PageId;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onPageChange: (page: PageId) => void;
};

const NAV_ITEMS: { id: PageId; icon: typeof BookOpen }[] = [
  { id: PAGES.LLM_WIKI, icon: BookOpen },
];

export function Sidebar({ currentPage, collapsed, onToggleCollapse, onPageChange }: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border bg-background shrink-0 transition-[width] duration-300',
        collapsed ? 'w-14' : 'w-[var(--sidebar-width)]'
      )}
    >
      <div className="flex h-14 items-center justify-between px-3 border-b border-border shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="h-5 w-5 text-primary shrink-0" />
            <span className="font-semibold text-sm truncate">LLM-Wiki</span>
          </div>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto" onClick={onToggleCollapse}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {NAV_ITEMS.map(({ id, icon: Icon }) => (
          <Button
            key={id}
            variant={currentPage === id ? 'secondary' : 'ghost'}
            className={cn('w-full justify-start gap-2', collapsed && 'justify-center px-0')}
            onClick={() => onPageChange(id)}
            title={PAGE_LABELS[id]}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{PAGE_LABELS[id]}</span>}
          </Button>
        ))}
      </nav>

      {!collapsed && (
        <div className="p-3 border-t border-border text-[10px] text-muted-foreground">
          Mock 数据 · FastAPI 后端
        </div>
      )}
    </aside>
  );
}
