import { BarChart3, BookOpen, FolderOpen, LayoutGrid, MessageSquare, Network, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { PAGES, PAGE_LABELS, LLM_WIKI_TABS, KARPATHY_WIKI_TAGLINE, type LLMWikiTab, type PageId } from '@shared/constants';
import { useChatHeaderExtrasSlot } from '@/contexts/ChatHeaderExtras';

const TAB_ICONS: Record<LLMWikiTab, typeof LayoutGrid> = {
  workbench: LayoutGrid,
  rawfiles: FolderOpen,
  graph: Network,
  search: BarChart3,
};

type SiteHeaderProps = {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  currentPage: PageId;
  llmWikiTab: LLMWikiTab;
  onLlmWikiTabChange: (tab: LLMWikiTab) => void;
  onRefresh: () => void;
  onNewChat?: () => void;
  isMobile?: boolean;
};

export function SiteHeader({
  sidebarCollapsed,
  onToggleSidebar,
  currentPage,
  llmWikiTab,
  onLlmWikiTabChange,
  onRefresh,
  onNewChat,
  isMobile,
}: SiteHeaderProps) {
  const pageLabel = sidebarCollapsed ? 'LLM-Wiki' : (PAGE_LABELS[currentPage] ?? currentPage);
  const PageIcon =
    currentPage === PAGES.CHAT ? MessageSquare : BookOpen;
  const chatHeaderExtras = useChatHeaderExtrasSlot();

  return (
    <header
      className={cn(
        'shrink-0 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-sm',
        currentPage === PAGES.CHAT
          ? 'grid grid-cols-[1fr_auto] items-center gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(160px,16rem)_minmax(0,1fr)] lg:gap-4'
          : 'flex items-center justify-between gap-4 flex-wrap'
      )}
    >
      <div className="flex items-center gap-2 min-w-0 justify-self-start">
        <SidebarTrigger
          collapsed={sidebarCollapsed}
          onToggle={onToggleSidebar}
          className="-ml-1"
          isMobile={isMobile}
        />
        <div className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/5 text-primary shrink-0">
          <PageIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight truncate">{pageLabel}</h1>
          {!sidebarCollapsed && (
            <p className="text-xs text-muted-foreground">{KARPATHY_WIKI_TAGLINE}</p>
          )}
        </div>
      </div>

      {currentPage === PAGES.CHAT && chatHeaderExtras && (
        <div className="flex w-full min-w-0 justify-center col-span-2 lg:col-span-1 justify-self-center px-2">
          {chatHeaderExtras}
        </div>
      )}

      {currentPage === PAGES.LLM_WIKI && !sidebarCollapsed && (
        <Tabs value={llmWikiTab} onValueChange={(v) => onLlmWikiTabChange(v as LLMWikiTab)}>
          <TabsList className="h-9">
            {LLM_WIKI_TABS.map((t) => {
              const Icon = TAB_ICONS[t.id];
              return (
                <TabsTrigger key={t.id} value={t.id} className="text-xs gap-1.5 px-3">
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      )}

      <div className="flex items-center gap-2 shrink-0 justify-self-end">
        {currentPage === PAGES.LLM_WIKI && (
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            刷新
          </Button>
        )}
        {currentPage === PAGES.CHAT && onNewChat && (
          <Button variant="outline" size="sm" onClick={onNewChat}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            新建对话
          </Button>
        )}
      </div>
    </header>
  );
}
