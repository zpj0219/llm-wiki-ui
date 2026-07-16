import { useCallback, useEffect, useRef, useState } from 'react';
import { File, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { listWikiEntries, readWikiPage } from '@/services/wikiApi';
import { WikiMarkdownPreview } from './WikiMarkdownPreview';
import { normalizeWikiRel, resolveWikiRelPath } from './wikiPathResolve';

type FilePreviewDialogProps = {
  open: boolean;
  relPath: string | null;
  onOpenChange: (open: boolean) => void;
  /**
   * 预览内再点实体/来源时回调。
   * 传入则新开一层（由父级叠弹窗）；不传则在当前弹窗内切换。
   */
  onOpenLinkedPage?: (relPath: string) => void;
  /** 叠层 z-index，默认 50 */
  zIndex?: number;
  /** 是否显示半透明遮罩；叠层时仅顶层为 true，避免颜色叠加变深 */
  showBackdrop?: boolean;
  /** 打开即用的路径种子（如图节点），避免等 listWikiEntries 才能点链接 */
  knownPaths?: string[];
  /** 初始路径是否需要按 Wiki 标题解析；文件管理传入真实路径时应关闭 */
  resolveInitialWikiPath?: boolean;
};

/** 可通过文本方式预览的文件扩展名 */
const PREVIEWABLE_EXTS = new Set([
  '.txt', '.md', '.json', '.xml', '.csv', '.log',
  '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.html', '.htm', '.css', '.js', '.ts', '.jsx', '.tsx',
  '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.sh', '.bat',
]);

function canPreview(relPath: string): boolean {
  const name = relPath.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot === -1) return true;
  return PREVIEWABLE_EXTS.has(name.slice(dot).toLowerCase());
}

/** 进程级缓存：entries 只请求一次，避免弹窗/叠层反复打 /api/wiki/entries */
let wikiMdPathsCache: string[] | null = null;
let wikiMdPathsPromise: Promise<string[]> | null = null;

function loadWikiMdPaths(): Promise<string[]> {
  if (wikiMdPathsCache) return Promise.resolve(wikiMdPathsCache);
  if (wikiMdPathsPromise) return wikiMdPathsPromise;
  wikiMdPathsPromise = listWikiEntries()
    .then((res) => {
      const paths = res.success
        ? res.files
            .filter((f) => !f.isDirectory && normalizeWikiRel(f.relPath).endsWith('.md'))
            .map((f) => normalizeWikiRel(f.relPath))
        : [];
      wikiMdPathsCache = paths;
      return paths;
    })
    .catch(() => {
      wikiMdPathsPromise = null;
      return [] as string[];
    });
  return wikiMdPathsPromise;
}

function mergePaths(seed: string[], extra: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of [...seed, ...extra]) {
    const n = normalizeWikiRel(p);
    if (!n.endsWith('.md')) continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

export function FilePreviewDialog({
  open,
  relPath,
  onOpenChange,
  onOpenLinkedPage,
  zIndex = 50,
  showBackdrop = true,
  knownPaths,
  resolveInitialWikiPath = true,
}: FilePreviewDialogProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const knownMdRef = useRef<string[]>([]);
  const loadSeqRef = useRef(0);
  const loadedForOpenRef = useRef(false);
  const knownPathsRef = useRef<string[]>(knownPaths ?? []);
  // 仅同步最新种子，不作为 effect 依赖（避免父组件每次 map 出新数组导致死循环请求）
  knownPathsRef.current = knownPaths ?? [];

  const onOpenLinkedPageRef = useRef(onOpenLinkedPage);
  onOpenLinkedPageRef.current = onOpenLinkedPage;

  // 打开时：立刻用种子 resolve；entries 只在「本次打开」拉一次（有全局缓存）
  useEffect(() => {
    if (!open) {
      knownMdRef.current = [];
      loadedForOpenRef.current = false;
      setActivePath(null);
      setContent(null);
      setError(null);
      return;
    }

    const seed = (knownPathsRef.current ?? [])
      .map(normalizeWikiRel)
      .filter((p) => p.endsWith('.md'));
    // 若已有全局缓存，直接合并
    knownMdRef.current = mergePaths(seed, wikiMdPathsCache ?? []);

    const initial = relPath
      ? resolveInitialWikiPath
        ? resolveWikiRelPath(relPath, knownMdRef.current)
        : normalizeWikiRel(relPath)
      : null;
    setActivePath(initial);

    // 同一次 open 只拉一次；缓存命中时几乎不发网络
    if (loadedForOpenRef.current && wikiMdPathsCache) return;
    loadedForOpenRef.current = true;

    let cancelled = false;
    void loadWikiMdPaths().then((fromApi) => {
      if (cancelled) return;
      knownMdRef.current = mergePaths(seed, fromApi);
      if (relPath) {
        const resolved = resolveInitialWikiPath
          ? resolveWikiRelPath(relPath, knownMdRef.current)
          : normalizeWikiRel(relPath);
        setActivePath((cur) => {
          if (cur == null || cur === relPath || cur === initial) return resolved;
          return cur;
        });
      }
    });

    return () => {
      cancelled = true;
    };
    // 注意：不要依赖 knownPaths 数组引用
  }, [open, relPath, resolveInitialWikiPath]);

  useEffect(() => {
    if (!open || !activePath) return;
    if (!canPreview(activePath)) {
      setLoading(false);
      setContent(null);
      setError(null);
      return;
    }

    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError(null);
    void readWikiPage(activePath).then((res) => {
      if (seq !== loadSeqRef.current) return;
      setLoading(false);
      if (res.success) {
        setContent(res.content ?? '');
        setError(null);
      } else {
        setContent(null);
        setError(res.error ?? '读取失败');
      }
    });
  }, [open, activePath]);

  const fileName = activePath?.split('/').pop() ?? '';
  const isMarkdown = fileName.endsWith('.md');
  const isBinary =
    Boolean(activePath) &&
    (!canPreview(activePath!) || (!loading && !error && content == null));

  const handleOpenPage = useCallback((path: string) => {
    if (!path) return;
    const resolved = resolveWikiRelPath(path, knownMdRef.current);
    const linked = onOpenLinkedPageRef.current;
    if (linked) {
      // 叠层场景：立刻 push，不依赖 entries 索引是否已回填
      linked(resolved || path);
      return;
    }
    setActivePath(resolved || path);
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className="!max-w-[90vw]"
      zIndex={zIndex}
      showBackdrop={showBackdrop}
    >
      <DialogContent onClose={() => onOpenChange(false)} className="h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <File className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{fileName || '预览'}</span>
          </DialogTitle>
        </DialogHeader>

        {activePath && (
          <p className="text-[11px] text-muted-foreground font-mono truncate shrink-0 px-6">
            {activePath}
          </p>
        )}

        <div className="flex-1 min-h-0 px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <File className="h-10 w-10 text-muted-foreground/30" strokeWidth={1.25} />
              <p className="text-sm text-muted-foreground">读取文件失败</p>
              <p className="text-xs text-muted-foreground/60">{error}</p>
              {activePath && (
                <p className="text-[11px] font-mono text-muted-foreground/50 break-all max-w-md px-4">
                  {activePath}
                </p>
              )}
            </div>
          ) : isBinary ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <File className="h-10 w-10 text-muted-foreground/30" strokeWidth={1.25} />
              <div>
                <p className="text-sm font-medium text-muted-foreground">不支持预览此格式</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  二进制或不可读格式（PDF、DOCX、图片等），仅可下载查看
                </p>
              </div>
            </div>
          ) : (
            <div className="h-full rounded-md border overflow-auto p-6 bg-background">
              {isMarkdown ? (
                <WikiMarkdownPreview
                  key={activePath ?? 'empty'}
                  content={content ?? ''}
                  onOpenPage={handleOpenPage}
                />
              ) : (
                <pre className="text-xs font-mono whitespace-pre-wrap break-all">{content}</pre>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
