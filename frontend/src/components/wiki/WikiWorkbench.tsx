import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, File, FileText, LayoutGrid, Link2, Loader2, Menu, Pencil, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { categoryLabel, cn, isWikiDirMarkdown } from '@/lib/utils';
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
import { resolveWikiRelPath } from './wikiPathResolve';
import { Sheet, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';

type WikiWorkbenchProps = {
  refreshKey?: number;
  onOpenGraph?: (relPath: string) => void;
};

const WIKI_SIDEBAR_WIDTH_KEY = 'llm-wiki-workbench-sidebar-width';
const WIKI_SIDEBAR_DEFAULT_WIDTH = 256;
const WIKI_SIDEBAR_MIN_WIDTH = 200;
const WIKI_SIDEBAR_MAX_WIDTH = 520;

function clampSidebarWidth(width: number): number {
  return Math.min(WIKI_SIDEBAR_MAX_WIDTH, Math.max(WIKI_SIDEBAR_MIN_WIDTH, width));
}

function getInitialSidebarWidth(): number {
  if (typeof window === 'undefined') return WIKI_SIDEBAR_DEFAULT_WIDTH;
  const saved = Number(window.localStorage.getItem(WIKI_SIDEBAR_WIDTH_KEY));
  return Number.isFinite(saved) && saved > 0
    ? clampSidebarWidth(saved)
    : WIKI_SIDEBAR_DEFAULT_WIDTH;
}

function useIsMobile() {
  const [v, setV] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches);
  useEffect(() => { const m = window.matchMedia('(max-width: 1023px)'); const h = (e: MediaQueryListEvent) => setV(e.matches); m.addEventListener('change', h); return () => m.removeEventListener('change', h); }, []);
  return v;
}

export function WikiWorkbench({ refreshKey = 0, onOpenGraph }: WikiWorkbenchProps) {
  const isMobile = useIsMobile();
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [files, setFiles] = useState<WikiFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backlinks, setBacklinks] = useState<string[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const sidebarResizeRef = useRef({
    pointerId: 0,
    startX: 0,
    startWidth: WIKI_SIDEBAR_DEFAULT_WIDTH,
  });
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['wiki']));

  const WIKI_SUBS = ['wiki/entities', 'wiki/topics', 'wiki/sources', 'wiki/synthesis/sessions'];

  const openPage = useCallback(async (relPath: string) => {
    // 预览里的 [[实体]] 常被编成 wiki/标题.md，需按文件树解析到真实路径
    const knownMd = files
      .filter((f) => !f.isDirectory && f.relPath.replace(/\\/g, '/').endsWith('.md'))
      .map((f) => f.relPath);
    const resolved = knownMd.length > 0 ? resolveWikiRelPath(relPath, knownMd) : relPath;

    setSelectedPath(resolved);
    // 展开父目录，方便在树里看到选中项
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.add('wiki');
      const parts = resolved.replace(/\\/g, '/').split('/');
      for (let i = 1; i < parts.length; i++) {
        next.add(parts.slice(0, i).join('/'));
      }
      return next;
    });

    setLoading(true);
    setError(null);
    const isWiki = isWikiDirMarkdown(resolved);
    try {
      const res = await readWikiPage(resolved);
      const text = res.success && res.content != null ? res.content : '';
      if (!res.success) setError(res.error ?? '读取失败');
      setDraft(text);
      setSavedContent(text);
      if (isWiki) {
        setBacklinks(await getWikiBacklinks(resolved));
      } else {
        setBacklinks([]);
      }
    } finally {
      setLoading(false);
    }
  }, [files]);

  const refreshTree = useCallback(async () => {
    // 用户点刷新 / refreshKey 变化时应拿最新文件树
    const entriesRes = await listWikiEntries({ force: true });
    if (entriesRes.success) {
      setFiles(entriesRes.files);
    } else {
      setError(entriesRes.error ?? '加载文件树失败');
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

  const beginSidebarResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (sidebarCollapsed) return;
      event.preventDefault();
      sidebarResizeRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: sidebarWidth,
      };
      setIsResizingSidebar(true);
    },
    [sidebarCollapsed, sidebarWidth]
  );

  useEffect(() => {
    if (!isResizingSidebar) return;

    const onPointerMove = (event: PointerEvent) => {
      const state = sidebarResizeRef.current;
      if (event.pointerId !== state.pointerId) return;
      const next = clampSidebarWidth(state.startWidth + event.clientX - state.startX);
      setSidebarWidth(next);
    };

    const endResize = (event: PointerEvent) => {
      const state = sidebarResizeRef.current;
      if (event.pointerId !== state.pointerId) return;
      setIsResizingSidebar(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endResize);
    window.addEventListener('pointercancel', endResize);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endResize);
      window.removeEventListener('pointercancel', endResize);
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    if (typeof window === 'undefined' || sidebarCollapsed) return;
    window.localStorage.setItem(WIKI_SIDEBAR_WIDTH_KEY, String(Math.round(sidebarWidth)));
  }, [sidebarCollapsed, sidebarWidth]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {error && (
        <div className="shrink-0 px-4 py-2 bg-destructive/10 text-destructive text-xs border-b">
          {error}
        </div>
      )}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 移动端文件树 Sheet */}
        <Sheet open={isMobile && mobileTreeOpen} onOpenChange={setMobileTreeOpen}>
          <SheetHeader>
            <SheetTitle>工作台</SheetTitle>
            <SheetClose onClose={() => setMobileTreeOpen(false)} />
          </SheetHeader>
          <div className="flex-1 overflow-y-auto py-1">
            {WIKI_SUBS.map((sub) => {
              const subOpen = expandedNodes.has(sub);
              return (
                <div key={sub}>
                  <button type="button" className={cn('w-full flex items-center justify-between py-1.5 text-xs font-medium', subOpen ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60')} style={{ paddingLeft: '2rem', paddingRight: '0.5rem' }} onClick={() => { const n = new Set(expandedNodes); subOpen ? n.delete(sub) : n.add(sub); setExpandedNodes(n); }}>
                    <span className="truncate">{categoryLabel(sub)}</span>
                    <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', subOpen && 'rotate-90')} />
                  </button>
                  {subOpen && <WikiFileTree files={files} selectedPath={selectedPath} onSelect={(p) => { void openPage(p); setMobileTreeOpen(false); }} rootPath={sub} baseIndent={32} />}
                </div>
              );
            })}
          </div>
        </Sheet>

        {/* 桌面端侧边栏 */}
        <div
          className={cn(
            'hidden lg:flex relative border-r border-border bg-muted/30 flex-col min-w-0 shrink-0',
            !isResizingSidebar && 'transition-[width] duration-300',
            sidebarCollapsed && 'w-12'
          )}
          style={sidebarCollapsed ? undefined : { width: sidebarWidth }}
        >
          <div className="p-2.5 flex items-center justify-between shrink-0 border-b border-border bg-background/50">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-1.5 text-xs font-medium px-3">
                <LayoutGrid className="h-3.5 w-3.5" />
                工作台
              </div>
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
            <>
              {/* 分类导航 — 无箭头，纯缩进层级 */}
              <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
                <div className="py-1 min-w-0">
                  {WIKI_SUBS.map((sub) => {
                    const subOpen = expandedNodes.has(sub);
                    return (
                      <div key={sub}>
                        <button
                          type="button"
                          className={cn(
                            'w-full flex items-center justify-between py-1.5 text-xs font-medium rounded-none transition-colors min-w-0',
                            subOpen
                              ? 'bg-accent text-foreground'
                              : 'text-muted-foreground hover:bg-accent/60',
                          )}
                          style={{ paddingLeft: '2rem', paddingRight: '0.5rem' }}
                          onClick={() => {
                            const next = new Set(expandedNodes);
                            if (subOpen) next.delete(sub);
                            else next.add(sub);
                            setExpandedNodes(next);
                          }}
                        >
                          <span className="truncate">{categoryLabel(sub)}</span>
                          <span className="flex items-center gap-1.5">
                            <ChevronRight
                              className={cn(
                                'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
                                subOpen && 'rotate-90',
                              )}
                            />
                          </span>
                        </button>
                        {subOpen && (
                          <WikiFileTree
                            files={files}
                            selectedPath={selectedPath}
                            onSelect={(p) => void openPage(p)}
                            rootPath={sub}
                            baseIndent={32}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {!sidebarCollapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="调整页面列表宽度"
              title="拖拽调整页面列表宽度"
              className={cn(
                'absolute -right-1 top-0 z-20 h-full w-2 cursor-col-resize',
                'after:absolute after:left-1/2 after:top-0 after:h-full after:w-px after:-translate-x-1/2 after:bg-transparent',
                'hover:after:bg-primary/60',
                isResizingSidebar && 'after:bg-primary'
              )}
              onPointerDown={beginSidebarResize}
            />
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* 移动端文件树按钮 */}
          {isMobile && (
            <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMobileTreeOpen(true)}>
                <Menu className="h-4 w-4" />
              </Button>
              <span className="text-xs font-medium text-muted-foreground">页面列表</span>
            </div>
          )}
          {selectedPath ? (
            (() => {
              const isWikiSelected = isWikiDirMarkdown(selectedPath);
              const isBinaryPreview = !isWikiSelected && !loading && !draft;
              return (
            <Tabs defaultValue="preview" className="flex-1 flex flex-col min-h-0">
              <div className="shrink-0 border-b border-border">
                <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-2 flex-wrap">
                  <TabsList className="h-9">
                    <TabsTrigger value="preview" className="text-xs">
                      <Eye className="h-3 w-3 mr-1" />预览
                    </TabsTrigger>
                    {isWikiSelected && (
                      <TabsTrigger value="edit" className="text-xs">
                        <Pencil className="h-3 w-3 mr-1" />编辑
                      </TabsTrigger>
                    )}
                    {isWikiSelected && (
                      <TabsTrigger value="backlinks" className="text-xs">
                        <Link2 className="h-3 w-3 mr-1" />反向链接 ({backlinks.length})
                      </TabsTrigger>
                    )}
                  </TabsList>
                  <div className="flex items-center gap-2">
                    {isWikiSelected && onOpenGraph && (
                      <Button variant="outline" size="sm" onClick={() => onOpenGraph(selectedPath)}>
                        局部图
                      </Button>
                    )}
                    {isWikiSelected && (
                      <Button variant="outline" size="sm" disabled={saving || !dirty} onClick={() => void savePage()}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                        保存
                      </Button>
                    )}
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
                ) : isBinaryPreview ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6">
                    <File className="h-10 w-10 text-muted-foreground/30" strokeWidth={1.25} />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">无法预览此文件</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        二进制或不可读格式（.docx .pdf .png 等），仅可下载查看
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {isWikiSelected && (
                      <TabsContent value="edit" className="absolute inset-0 m-0 data-[state=inactive]:hidden">
                        <textarea
                          className="block h-full w-full resize-none border-0 bg-background px-4 py-3 font-mono text-base sm:text-sm focus-visible:outline-none"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          spellCheck={false}
                        />
                      </TabsContent>
                    )}
                    <TabsContent value="preview" className="absolute inset-0 m-0 data-[state=inactive]:hidden">
                      <ScrollArea type="always" className="h-full">
                        <div className="p-6">
                          <WikiMarkdownPreview
                            content={draft}
                            onOpenPage={(p) => void openPage(p)}
                          />
                        </div>
                      </ScrollArea>
                    </TabsContent>
                    {isWikiSelected && (
                      <TabsContent value="backlinks" className="absolute inset-0 m-0 data-[state=inactive]:hidden">
                        <ScrollArea type="always" className="h-full">
                          <div className="p-6">
                            {backlinks.length === 0 ? (
                              <p className="text-sm text-muted-foreground">暂无其它页面链接到本页</p>
                            ) : (
                              <ul className="space-y-2">
                                {[...backlinks].sort((a, b) => {
                                  const aIdx = a.endsWith('/index.md') || a === 'wiki/index.md' ? 0 : 1;
                                  const bIdx = b.endsWith('/index.md') || b === 'wiki/index.md' ? 0 : 1;
                                  if (aIdx !== bIdx) return aIdx - bIdx;
                                  return a.localeCompare(b, 'zh-CN');
                                }).map((p) => (
                                  <li key={p} className="flex items-center gap-1.5">
                                    <Link2 className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
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
                    )}
                  </>
                )}
              </div>
            </Tabs>
              );
            })()
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
                <FileText className="h-8 w-8 text-muted-foreground/50" strokeWidth={1.25} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">选择 Wiki 页面</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  从左侧文件树选择 Markdown 页面；上传文件请点击右上角「上传文件」
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
