import { BookOpen, LayoutGrid, MessageSquare, Network, Plus, RefreshCw, Search, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PAGES, PAGE_LABELS, LLM_WIKI_TABS, KARPATHY_WIKI_TAGLINE, type LLMWikiTab, type PageId } from '@shared/constants';

const TAB_ICONS: Record<LLMWikiTab, typeof LayoutGrid> = {
  workbench: LayoutGrid,
  graph: Network,
  search: Search,
};

type SiteHeaderProps = {
  currentPage: PageId;
  llmWikiTab: LLMWikiTab;
  onLlmWikiTabChange: (tab: LLMWikiTab) => void;
  onRefresh: () => void;
  onOpenSettings?: () => void;
  onNewChat?: () => void;
};

export function SiteHeader({
  currentPage,
  llmWikiTab,
  onLlmWikiTabChange,
  onRefresh,
  onOpenSettings,
  onNewChat,
}: SiteHeaderProps) {
  const pageLabel = PAGE_LABELS[currentPage] ?? currentPage;
  const PageIcon =
    currentPage === PAGES.CHAT ? MessageSquare : BookOpen;

  return (
    <header className="shrink-0 border-b border-border bg-background/80 px-4 py-3 flex items-center justify-between gap-4 flex-wrap backdrop-blur-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/5 text-primary shrink-0">
          <PageIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight truncate">{pageLabel}</h1>
          <p className="text-xs text-muted-foreground">{KARPATHY_WIKI_TAGLINE}</p>
        </div>
      </div>

      {currentPage === PAGES.LLM_WIKI && (
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

      <div className="flex items-center gap-2 shrink-0">
        {currentPage === PAGES.LLM_WIKI && (
          <>
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              刷新
            </Button>
            <Button variant="outline" size="sm" disabled title="后续版本支持">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              新建
            </Button>
          </>
        )}
        {currentPage === PAGES.CHAT && onNewChat && (
          <Button variant="outline" size="sm" onClick={onNewChat}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            新建对话
          </Button>
        )}
        {onOpenSettings && currentPage !== PAGES.SETTINGS && (
          <Button variant="outline" size="sm" onClick={onOpenSettings}>
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            设置
          </Button>
        )}
      </div>
    </header>
  );
}
