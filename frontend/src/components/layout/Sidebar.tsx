import { BookOpen, ChevronLeft, ChevronRight, MessageSquare, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { UserInfo } from '@/components/layout/UserInfo';
import { PAGES, PAGE_LABELS, KARPATHY_WIKI_TAGLINE, type PageId } from '@shared/constants';

type SidebarProps = {
  currentPage: PageId;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onPageChange: (page: PageId) => void;
};

const NAV_ITEMS: { id: PageId; icon: typeof BookOpen }[] = [
  { id: PAGES.CHAT, icon: MessageSquare },
  { id: PAGES.LLM_WIKI, icon: BookOpen },
  { id: PAGES.SETTINGS, icon: Settings },
];

export function Sidebar({
  currentPage,
  collapsed,
  onToggleCollapse,
  onPageChange,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border bg-background shrink-0 transition-[width] duration-300',
        collapsed ? 'w-14' : 'w-[var(--sidebar-width)]'
      )}
    >
      <div className="relative flex h-14 items-center justify-between px-3 border-b border-border shrink-0">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground shrink-0">
              <BookOpen className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <span className="font-semibold text-sm truncate block leading-tight">LLM-Wiki</span>
              <span className="text-[10px] text-muted-foreground truncate block">{KARPATHY_WIKI_TAGLINE}</span>
            </div>
          </div>
        ) : (
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground mx-auto">
            <BookOpen className="h-4 w-4" />
          </div>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onToggleCollapse}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {!collapsed && (
          <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            导航
          </p>
        )}
        {NAV_ITEMS.map(({ id, icon: Icon }) => (
          <Button
            key={id}
            variant={currentPage === id ? 'secondary' : 'ghost'}
            className={cn(
              'w-full justify-start gap-2.5 h-9',
              collapsed && 'justify-center px-0',
              currentPage === id && 'font-medium shadow-sm'
            )}
            onClick={() => onPageChange(id)}
            title={PAGE_LABELS[id]}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{PAGE_LABELS[id]}</span>}
          </Button>
        ))}
      </nav>

      {!collapsed && <UserInfo />}
    </aside>
  );
}
