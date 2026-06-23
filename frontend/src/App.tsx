import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { LLMWikiPage } from '@/pages/LLMWiki';
import { PAGES, type PageId, type LLMWikiTab } from '@shared/constants';
import { refreshWikiIndex } from '@/services/wikiApi';

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageId>(PAGES.LLM_WIKI);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [llmWikiTab, setLlmWikiTab] = useState<LLMWikiTab>('workbench');
  const [refreshKey, setRefreshKey] = useState(0);
  const [graphFocusPath, setGraphFocusPath] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    await refreshWikiIndex().catch(() => undefined);
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const onFocusGraph = (e: Event) => {
      const rel = (e as CustomEvent<string>).detail;
      if (typeof rel === 'string' && rel) setGraphFocusPath(rel);
    };
    window.addEventListener('llm-wiki:graph-focus', onFocusGraph);
    return () => window.removeEventListener('llm-wiki:graph-focus', onFocusGraph);
  }, []);

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar
        currentPage={currentPage}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onPageChange={setCurrentPage}
      />

      <div className="flex-1 flex flex-col min-w-0 m-3 rounded-xl border border-container-border bg-container overflow-hidden">
        <SiteHeader
          currentPage={currentPage}
          llmWikiTab={llmWikiTab}
          onLlmWikiTabChange={setLlmWikiTab}
          onRefresh={() => void handleRefresh()}
        />

        <main className="flex-1 min-h-0 overflow-hidden">
          {currentPage === PAGES.LLM_WIKI && (
            <LLMWikiPage
              activeTab={llmWikiTab}
              refreshKey={refreshKey}
              graphFocusPath={graphFocusPath}
              onActiveTabChange={setLlmWikiTab}
            />
          )}
        </main>
      </div>
    </div>
  );
}
