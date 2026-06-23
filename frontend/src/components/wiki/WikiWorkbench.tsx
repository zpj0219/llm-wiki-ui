import { useCallback, useEffect, useState } from 'react';
import { Save, Loader2, Link2, Eye, Pencil, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn, isWikiDirMarkdown } from '@/lib/utils';
import {
  listWikiEntries,
  readWikiPage,
  writeWikiPage,
  getWikiBacklinks,
} from '@/services/wikiApi';
import type { WikiFileEntry } from '@shared/types';
import { WikiFileTree } from './WikiFileTree';
import { WikiMarkdownPreview } from './WikiMarkdownPreview';
import { WikiPathBreadcrumb } from './WikiPathBreadcrumb';

type WikiWorkbenchProps = {
  refreshKey?: number;
  onOpenGraph?: (relPath: string) => void;
};

export function WikiWorkbench({ refreshKey = 0, onOpenGraph }: WikiWorkbenchProps) {
  const [files, setFiles] = useState<WikiFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backlinks, setBacklinks] = useState<string[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPage = useCallback(async (relPath: string) => {
    if (!isWikiDirMarkdown(relPath)) return;
    setSelectedPath(relPath);
    setLoading(true);
    setError(null);
    try {
      const res = await readWikiPage(relPath);
      const text = res.success && res.content != null ? res.content : '';
      if (!res.success) setError(res.error ?? '读取失败');
      setDraft(text);
      setSavedContent(text);
      setBacklinks(await getWikiBacklinks(relPath));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshTree = useCallback(async () => {
    const res = await listWikiEntries();
    if (res.success) {
      setFiles(res.files);
    } else {
      setError(res.error ?? '加载文件树失败');
    }
  }, []);

  useEffect(() => {
    void refreshTree();
  }, [refreshTree, refreshKey]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const rel = (e as CustomEvent<string>).detail;
      if (typeof rel === 'string' && rel) void openPage(rel);
    };
    window.addEventListener('llm-wiki:open-page', onOpen);
    return () => window.removeEventListener('llm-wiki:open-page', onOpen);
  }, [openPage]);

  const savePage = async () => {
    if (!selectedPath) return;
    setSaving(true);
    try {
      const wr = await writeWikiPage(selectedPath, draft);
      if (!wr.success) {
        setError(wr.error ?? '保存失败');
        return;
      }
      setSavedContent(draft);
      setBacklinks(await getWikiBacklinks(selectedPath));
    } finally {
      setSaving(false);
    }
  };

  const dirty = selectedPath != null && draft !== savedContent;

  return (
    <div className="flex flex-col h-full min-h-0">
      {error && (
        <div className="shrink-0 px-4 py-2 bg-destructive/10 text-destructive text-xs border-b">
          {error}
        </div>
      )}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div
          className={cn(
            'border-r border-border bg-muted/30 flex flex-col shrink-0 transition-[width] duration-300',
            sidebarCollapsed ? 'w-12' : 'w-64'
          )}
        >
          <div className="p-2.5 flex items-center justify-between shrink-0 border-b border-border bg-background/50">
            {!sidebarCollapsed && (
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-2">
                页面
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 ml-auto"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>
          {!sidebarCollapsed && (
            <ScrollArea className="flex-1">
              <div className="p-2">
                <WikiFileTree
                  files={files}
                  selectedPath={selectedPath}
                  onSelect={(p) => void openPage(p)}
                />
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {selectedPath ? (
            <Tabs defaultValue="edit" className="flex-1 flex flex-col min-h-0">
              <div className="shrink-0 border-b border-border">
                <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-2 flex-wrap">
                  <TabsList className="h-9">
                    <TabsTrigger value="edit" className="text-xs">
                      <Pencil className="h-3 w-3 mr-1" />编辑
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="text-xs">
                      <Eye className="h-3 w-3 mr-1" />预览
                    </TabsTrigger>
                    <TabsTrigger value="backlinks" className="text-xs">
                      <Link2 className="h-3 w-3 mr-1" />反向链接 ({backlinks.length})
                    </TabsTrigger>
                  </TabsList>
                  <div className="flex items-center gap-2">
                    {onOpenGraph && (
                      <Button variant="outline" size="sm" onClick={() => onOpenGraph(selectedPath)}>
                        局部图
                      </Button>
                    )}
                    <Button variant="outline" size="sm" disabled={saving || !dirty} onClick={() => void savePage()}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                      保存
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 border-t border-border">
                  <WikiPathBreadcrumb relPath={selectedPath} />
                  {dirty && <Badge variant="secondary">未保存</Badge>}
                </div>
              </div>

              <div className="flex-1 min-h-0 relative overflow-hidden">
                {loading ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <TabsContent value="edit" className="absolute inset-0 m-0 data-[state=inactive]:hidden">
                      <textarea
                        className="block h-full w-full resize-none border-0 bg-background px-4 py-3 font-mono text-sm focus-visible:outline-none"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        spellCheck={false}
                      />
                    </TabsContent>
                    <TabsContent value="preview" className="absolute inset-0 m-0 data-[state=inactive]:hidden">
                      <ScrollArea className="h-full">
                        <div className="p-6">
                          <WikiMarkdownPreview
                            content={draft}
                            onOpenPage={(p) => void openPage(p)}
                          />
                        </div>
                      </ScrollArea>
                    </TabsContent>
                    <TabsContent value="backlinks" className="absolute inset-0 m-0 data-[state=inactive]:hidden">
                      <ScrollArea className="h-full">
                        <div className="p-6">
                          {backlinks.length === 0 ? (
                            <p className="text-sm text-muted-foreground">暂无其它页面链接到本页</p>
                          ) : (
                            <ul className="space-y-2">
                              {backlinks.map((p) => (
                                <li key={p}>
                                  <button
                                    type="button"
                                    className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                                    onClick={() => void openPage(p)}
                                  >
                                    {p}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  </>
                )}
              </div>
            </Tabs>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
                <FileText className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.25} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">选择 Wiki 页面</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  从左侧文件树选择 Markdown 页面，可编辑、预览或查看反向链接
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
