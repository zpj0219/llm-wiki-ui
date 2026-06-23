import { BookOpen, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PAGES, PAGE_LABELS, LLM_WIKI_TABS, type LLMWikiTab } from '@shared/constants';

type SiteHeaderProps = {
  currentPage: string;
  llmWikiTab: LLMWikiTab;
  onLlmWikiTabChange: (tab: LLMWikiTab) => void;
  onRefresh: () => void;
};

export function SiteHeader({
  currentPage,
  llmWikiTab,
  onLlmWikiTabChange,
  onRefresh,
}: SiteHeaderProps) {
  const pageLabel = PAGE_LABELS[currentPage as keyof typeof PAGE_LABELS] ?? currentPage;

  return (
    <header className="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <BookOpen className="h-5 w-5 text-primary shrink-0" />
        <div className="min-w-0">
          <h1 className="text-base font-semibold truncate">{pageLabel}</h1>
          <p className="text-xs text-muted-foreground">工业设备维修知识库</p>
        </div>
      </div>

      {currentPage === PAGES.LLM_WIKI && (
        <Tabs value={llmWikiTab} onValueChange={(v) => onLlmWikiTabChange(v as LLMWikiTab)}>
          <TabsList>
            {LLM_WIKI_TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="text-xs">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          刷新
        </Button>
        <Button variant="outline" size="sm" disabled title="后续版本支持">
          <Plus className="h-3.5 w-3.5 mr-1" />
          新建
        </Button>
      </div>
    </header>
  );
}
