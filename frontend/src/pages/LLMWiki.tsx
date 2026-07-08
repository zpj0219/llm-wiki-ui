import { Tabs, TabsContent } from '@/components/ui/tabs';
import { WikiWorkbench } from '@/components/wiki/WikiWorkbench';
import { WikiRawFilesPanel } from '@/components/wiki/WikiRawFilesPanel';
import { WikiGraphView } from '@/components/wiki/WikiGraphView';
import { WikiSearchPanel } from '@/components/wiki/WikiSearchPanel';
import { type LLMWikiTab } from '@shared/constants';
import { getStoredPermissions } from '@/services/authSession';
import type { UserPermissions } from '@shared/types';

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
  const perms = getStoredPermissions() as UserPermissions | null;
  const isAdmin = localStorage.getItem('isSuperUser') === 'true';

  const can = (key: keyof UserPermissions): boolean => {
    if (isAdmin) return true;
    if (!perms) return true;
    return perms[key] !== false;
  };

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
          {can('can_access_wiki_workbench') ? (
            <WikiWorkbench
              refreshKey={refreshKey}
              onOpenGraph={(rel) => {
                if (can('can_access_wiki_graph')) {
                  onActiveTabChange('graph');
                  window.dispatchEvent(new CustomEvent('llm-wiki:graph-focus', { detail: rel }));
                }
              }}
            />
          ) : (
            <PermissionDenied />
          )}
        </TabsContent>

        <TabsContent
          value="rawfiles"
          className="flex-1 flex flex-col m-0 min-h-0 overflow-hidden data-[state=inactive]:hidden"
        >
          {can('can_access_wiki_rawfiles') ? (
            <WikiRawFilesPanel refreshKey={refreshKey} />
          ) : (
            <PermissionDenied />
          )}
        </TabsContent>

        <TabsContent
          value="graph"
          className="flex-1 flex flex-col m-0 min-h-0 overflow-hidden data-[state=inactive]:hidden"
        >
          {can('can_access_wiki_graph') ? (
            <WikiGraphView
              refreshKey={refreshKey}
              focusPath={graphFocusPath}
              forceLocalGraph={Boolean(graphFocusPath)}
              onOpenPage={openGraphPage}
            />
          ) : (
            <PermissionDenied />
          )}
        </TabsContent>

        <TabsContent
          value="search"
          className="flex-1 flex flex-col m-0 min-h-0 overflow-hidden data-[state=inactive]:hidden"
        >
          {can('can_access_wiki_search') ? (
            <WikiSearchPanel
              refreshKey={refreshKey}
              onOpenPage={(rel) => {
                onActiveTabChange('workbench');
                window.dispatchEvent(new CustomEvent('llm-wiki:open-page', { detail: rel }));
              }}
            />
          ) : (
            <PermissionDenied />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PermissionDenied() {
  return (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
      <div className="text-center space-y-2">
        <p className="text-base font-medium">无权限访问</p>
        <p className="text-xs">你没有访问此模块的权限，请联系管理员</p>
      </div>
    </div>
  );
}
