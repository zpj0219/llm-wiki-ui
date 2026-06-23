import { BookOpen, MessageSquare, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserInfo } from '@/components/layout/UserInfo';
import { PAGES, PAGE_LABELS, KARPATHY_WIKI_TAGLINE, type PageId } from '@shared/constants';

type SidebarProps = {
  currentPage: PageId;
  onPageChange: (page: PageId) => void;
};

const NAV_ITEMS: { id: PageId; icon: typeof BookOpen }[] = [
  { id: PAGES.CHAT, icon: MessageSquare },
  { id: PAGES.LLM_WIKI, icon: BookOpen },
  { id: PAGES.SETTINGS, icon: Settings },
];

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  return (
    <div
      data-sidebar
      className="flex h-full flex-col border-r border-border bg-background"
      style={{
        width: 'var(--sidebar-width)',
        minWidth: 'var(--sidebar-width)',
        maxWidth: 'var(--sidebar-width)',
      }}
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <BookOpen className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight">LLM-Wiki</span>
          <span className="block truncate text-[10px] text-muted-foreground">{KARPATHY_WIKI_TAGLINE}</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          导航
        </p>
        {NAV_ITEMS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
              currentPage === id
                ? 'bg-accent font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
            onClick={() => onPageChange(id)}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{PAGE_LABELS[id]}</span>
          </button>
        ))}
      </nav>

      <UserInfo />
    </div>
  );
}
