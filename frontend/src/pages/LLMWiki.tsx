import { Tabs, TabsContent } from '@/components/ui/tabs';
import { WikiWorkbench } from '@/components/wiki/WikiWorkbench';
import { WikiGraphView } from '@/components/wiki/WikiGraphView';
import { WikiSearchPanel } from '@/components/wiki/WikiSearchPanel';
import type { LLMWikiTab } from '@shared/constants';

type LLMWikiPageProps = {
  activeTab: LLMWikiTab;
  refreshKey: number;
  graphFocusPath: string | null;
  onActiveTabChange: (tab: LLMWikiTab) => void;
};

export function LLMWikiPage({
  activeTab,
  refreshKey,
  graphFocusPath,
  onActiveTabChange,
}: LLMWikiPageProps) {
  const openGraphPage = (relPath: string) => {
    onActiveTabChange('workbench');
    window.dispatchEvent(new CustomEvent('llm-wiki:open-page', { detail: relPath }));
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <Tabs value={activeTab} className="flex-1 flex flex-col min-h-0">
        <TabsContent
          value="workbench"
          className="flex-1 flex flex-col m-0 min-h-0 overflow-hidden data-[state=inactive]:hidden"
        >
          <WikiWorkbench
            refreshKey={refreshKey}
            onOpenGraph={(rel) => {
              onActiveTabChange('graph');
              window.dispatchEvent(new CustomEvent('llm-wiki:graph-focus', { detail: rel }));
            }}
          />
        </TabsContent>

        <TabsContent
          value="graph"
          className="flex-1 flex flex-col m-0 min-h-0 overflow-hidden data-[state=inactive]:hidden"
        >
          <WikiGraphView
            refreshKey={refreshKey}
            focusPath={graphFocusPath}
            forceLocalGraph={Boolean(graphFocusPath)}
            onOpenPage={openGraphPage}
          />
        </TabsContent>

        <TabsContent
          value="search"
          className="flex-1 flex flex-col m-0 min-h-0 overflow-hidden data-[state=inactive]:hidden"
        >
          <WikiSearchPanel
            refreshKey={refreshKey}
            onOpenPage={(rel) => {
              onActiveTabChange('workbench');
              window.dispatchEvent(new CustomEvent('llm-wiki:open-page', { detail: rel }));
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
