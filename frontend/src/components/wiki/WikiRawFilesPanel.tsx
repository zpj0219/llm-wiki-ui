import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CircleCheck, Clock, File, FileCheck, Folder, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

import { categoryLabel, cn, normPath, truncateMiddle } from '@/lib/utils';
import { listWikiEntries, getOriginalsStatus, ensureDir } from '@/services/wikiApi';
import { uploadOriginalWithProgress, type UploadProgress } from '@/services/uploadApi';
import { FilePreviewDialog } from './FilePreviewDialog';
import type { OriginalsFileStatus, WikiFileEntry } from '@shared/types';

type WikiRawFilesPanelProps = {
  refreshKey?: number;
};

const RAW_SUBS = ['raw/originals', 'raw/fulltext', 'raw/inbox'];

/** 获取路径的直接子节点（文件和目录） */
function getDirectChildren(
  allFiles: WikiFileEntry[],
  parentPath: string,
): { dirs: WikiFileEntry[]; files: WikiFileEntry[] } {
  const normParent = normPath(parentPath);
  const dirs: WikiFileEntry[] = [];
  const files: WikiFileEntry[] = [];
  const seen = new Set<string>();

  for (const entry of allFiles) {
    const p = normPath(entry.relPath);
    if (p === normParent || !p.startsWith(normParent + '/')) continue;

    const relative = p.slice(normParent.length + 1);
    const slashIdx = relative.indexOf('/');

    if (entry.isDirectory) {
      // Real directory entry — add if it's a direct child
      if (slashIdx === -1 && !seen.has(p)) {
        seen.add(p);
        dirs.push(entry);
      }
      continue;
    }

    if (slashIdx === -1) {
      // Direct child file
      if (!seen.has(p)) {
        seen.add(p);
        files.push(entry);
      }
    } else {
      // File nested inside a subdirectory — synthesize the directory entry
      const dirName = relative.slice(0, slashIdx);
      const dirPath = normParent + '/' + dirName;
      if (!seen.has(dirPath)) {
        seen.add(dirPath);
        dirs.push({ relPath: dirPath, isDirectory: true });
      }
    }
  }

  // Sort: directories first, then alphabetically (Chinese-aware)
  dirs.sort((a, b) => a.relPath.localeCompare(b.relPath, 'zh-CN'));
  files.sort((a, b) => a.relPath.localeCompare(b.relPath, 'zh-CN'));
  return { dirs, files };
}

function FileStatusIcon({ status }: { status: OriginalsFileStatus['stage'] }) {
  if (status === 'uploaded') {
    return <Clock className="h-3.5 w-3.5 text-amber-500" />;
  }
  if (status === 'fulltext') {
    return <FileCheck className="h-3.5 w-3.5 text-blue-500" />;
  }
  return <CircleCheck className="h-3.5 w-3.5 text-green-500" />;
}

type FileEntry = { file: File; relativePath?: string };

type DropResult = {
  files: FileEntry[];
  dirPaths: string[]; // all directory paths found (including empty ones)
};

/** 递归遍历拖放的目录树，提取所有文件及其相对路径，同时记录所有目录路径 */
async function getFilesFromDataTransfer(items: DataTransferItemList): Promise<DropResult> {
  const files: FileEntry[] = [];
  const dirPaths: string[] = [];

  async function walk(entry: FileSystemEntry, parentPath: string) {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        (entry as FileSystemFileEntry).file(resolve, reject);
      });
      const relPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
      files.push({ file, relativePath: relPath });
    } else if (entry.isDirectory) {
      const subPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
      dirPaths.push(subPath);

      const reader = (entry as FileSystemDirectoryEntry).createReader();

      // readEntries may need to be called repeatedly to get all entries
      const readAll = (): Promise<FileSystemEntry[]> => {
        return new Promise((resolve) => {
          const all: FileSystemEntry[] = [];
          const read = () => {
            reader.readEntries((entries) => {
              if (entries.length === 0) {
                resolve(all);
              } else {
                all.push(...entries);
                read();
              }
            });
          };
          read();
        });
      };

      const children = await readAll();
      for (const child of children) {
        await walk(child, subPath);
      }
    }
  }

  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item?.kind === 'file') {
      const entry = item.webkitGetAsEntry?.();
      if (entry) entries.push(entry);
      else if (item.getAsFile) {
        // Fallback for browsers without webkitGetAsEntry
        const file = item.getAsFile();
        if (file) files.push({ file });
      }
    }
  }

  for (const entry of entries) {
    await walk(entry, '');
  }

  return { files, dirPaths };
}

const STAGE_TOOLTIPS: Record<string, string> = {
  uploaded: '待处理 — 等待全文提取',
  fulltext: '已提取全文 — 等待实体生成',
  wiki: '已生成实体 — 知识条目已可用',
};

export function WikiRawFilesPanel({ refreshKey = 0 }: WikiRawFilesPanelProps) {
  const [allFiles, setAllFiles] = useState<WikiFileEntry[]>([]);
  const [statusMap, setStatusMap] = useState<Map<string, OriginalsFileStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; progress: UploadProgress } | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Navigation state
  const [activeSection, setActiveSection] = useState<string>('raw/originals');
  const [browsePath, setBrowsePath] = useState<string>('raw/originals');

  // Tooltip state (portal-based to avoid clipping)
  const [tipPath, setTipPath] = useState<string | null>(null);
  const [tipRect, setTipRect] = useState<DOMRect | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [entriesRes, statusRes] = await Promise.all([
      listWikiEntries(),
      getOriginalsStatus(),
    ]);
    if (entriesRes.success) {
      setAllFiles(entriesRes.files);
    } else {
      setError(entriesRes.error ?? '加载文件树失败');
    }
    if (statusRes.success && statusRes.statuses) {
      setStatusMap(new Map(Object.entries(statusRes.statuses)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData, refreshKey]);

  // When switching sections, reset browse path to that section root
  const switchSection = useCallback((sub: string) => {
    setActiveSection(sub);
    setBrowsePath(sub);
  }, []);

  const { dirs, files } = useMemo(
    () => getDirectChildren(allFiles, browsePath),
    [allFiles, browsePath],
  );

  const canGoUp = browsePath !== activeSection;
  const isOriginals = activeSection === 'raw/originals';

  const goUp = useCallback(() => {
    if (!canGoUp) return;
    const parent = browsePath.slice(0, browsePath.lastIndexOf('/'));
    if (parent && parent.startsWith(activeSection)) {
      setBrowsePath(parent);
    } else {
      setBrowsePath(activeSection);
    }
  }, [canGoUp, browsePath, activeSection]);

  const navigateTo = useCallback((dirPath: string) => {
    setBrowsePath(normPath(dirPath));
  }, []);

  // Drag-and-drop for originals
  const [dragOver, setDragOver] = useState(false);
  const [dropTargetDir, setDropTargetDir] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const folderDragCounters = useRef<Map<string, number>>(new Map());

  const uploadFiles = useCallback(
    async (entries: FileEntry[], baseTargetDir: string) => {
      setUploading(true);
      const outcomes: { name: string; ok: boolean; message: string }[] = [];

      for (const { file, relativePath } of entries) {
        const displayName = relativePath ?? file.name;
        setUploadProgress({ name: displayName, progress: { loaded: 0, total: file.size, percent: 0 } });

        // Build target dir: if file has a relative folder path, append it to base
        let targetDir = baseTargetDir;
        if (relativePath && relativePath.includes('/')) {
          const folderPath = relativePath.slice(0, relativePath.lastIndexOf('/'));
          targetDir = normPath(`${baseTargetDir}/${folderPath}`);
        }

        const res = await uploadOriginalWithProgress(
          file,
          { targetDir },
          (progress) => setUploadProgress({ name: displayName, progress }),
        );
        outcomes.push({
          name: displayName,
          ok: res.success,
          message: res.success ? (res.relPath ?? 'OK') : (res.error ?? '失败'),
        });
      }

      setUploadProgress(null);
      await fetchData();
      setUploading(false);

      const failures = outcomes.filter((o) => !o.ok);
      if (failures.length > 0) {
        setError(
          `上传失败 (${failures.length}/${outcomes.length}):\n` +
            failures.map((f) => `${f.name}: ${f.message}`).join('\n'),
        );
      } else {
        setError(null);
      }
    },
    [fetchData],
  );

  // Global area drag handlers (drop on empty space → browsePath)
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setDragOver(false);
      const targetDir = dropTargetDir ?? browsePath;

      const items = e.dataTransfer.items;
      if (items && items.length > 0 && typeof items[0]?.webkitGetAsEntry === 'function') {
        const { files, dirPaths } = await getFilesFromDataTransfer(items);
        if (files.length > 0) {
          await uploadFiles(files, targetDir);
        }
        // Create empty directories and refresh
        const created = await createEmptyDirs(dirPaths, files, targetDir);
        if (created) await fetchData();
      } else {
        const fileList = e.dataTransfer.files;
        if (fileList?.length) {
          const entries = Array.from(fileList).map((f) => ({ file: f }));
          await uploadFiles(entries, targetDir);
        }
      }
      setDropTargetDir(null);
    },
    [browsePath, dropTargetDir, uploadFiles, fetchData],
  );

  // Per-folder drag handlers (drop on a folder → that folder becomes target)
  const handleFolderDragEnter = useCallback(
    (e: React.DragEvent, dirPath: string) => {
      e.preventDefault();
      e.stopPropagation();
      const counters = folderDragCounters.current;
      counters.set(dirPath, (counters.get(dirPath) ?? 0) + 1);
      if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
        setDropTargetDir(dirPath);
      }
    },
    [],
  );

  const handleFolderDragLeave = useCallback((e: React.DragEvent, dirPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    const counters = folderDragCounters.current;
    const count = (counters.get(dirPath) ?? 1) - 1;
    if (count <= 0) {
      counters.delete(dirPath);
      setDropTargetDir((prev) => (prev === dirPath ? null : prev));
    } else {
      counters.set(dirPath, count);
    }
  }, []);

  const handleFolderDrop = useCallback(
    async (e: React.DragEvent, dirPath: string) => {
      e.preventDefault();
      e.stopPropagation();
      folderDragCounters.current.delete(dirPath);
      setDropTargetDir(null);
      setDragOver(false);
      dragCounter.current = 0;

      const items = e.dataTransfer.items;
      if (items && items.length > 0 && typeof items[0]?.webkitGetAsEntry === 'function') {
        const { files, dirPaths } = await getFilesFromDataTransfer(items);
        if (files.length > 0) {
          await uploadFiles(files, dirPath);
        }
        const created = await createEmptyDirs(dirPaths, files, dirPath);
        if (created) await fetchData();
      } else {
        const fileList = e.dataTransfer.files;
        if (fileList?.length) {
          const entries = Array.from(fileList).map((f) => ({ file: f }));
          await uploadFiles(entries, dirPath);
        }
      }
    },
    [uploadFiles, fetchData],
  );

  /** 为拖放中不含文件的空目录创建对应的知识库路径，返回是否创建了目录 */
  const createEmptyDirs = useCallback(
    async (allDirPaths: string[], uploadedFiles: FileEntry[], baseTargetDir: string): Promise<boolean> => {
      // Collect paths that actually have files
      const pathsWithFiles = new Set<string>();
      for (const { relativePath } of uploadedFiles) {
        if (relativePath && relativePath.includes('/')) {
          const parts = relativePath.split('/');
          for (let i = 1; i < parts.length; i++) {
            pathsWithFiles.add(parts.slice(0, i).join('/'));
          }
        }
      }

      let created = false;
      for (const dirPath of allDirPaths) {
        if (!pathsWithFiles.has(dirPath)) {
          const targetPath = normPath(`${baseTargetDir}/${dirPath}`);
          await ensureDir(targetPath);
          created = true;
        }
      }
      return created;
    },
    [],
  );

  // Breadcrumb segments from activeSection root to current browsePath
  const breadcrumbs = useMemo(() => {
    const segments: { label: string; path: string }[] = [];
    if (browsePath === activeSection) {
      segments.push({ label: categoryLabel(activeSection), path: activeSection });
      return segments;
    }
    // Add section root
    segments.push({ label: categoryLabel(activeSection), path: activeSection });
    const relative = browsePath.slice(activeSection.length + 1);
    const parts = relative.split('/');
    let accumulated = activeSection;
    for (const part of parts) {
      accumulated += '/' + part;
      segments.push({ label: part, path: accumulated });
    }
    return segments;
  }, [browsePath, activeSection]);

  const handleFileDoubleClick = useCallback(
    (entry: WikiFileEntry) => {
      if (entry.isDirectory) {
        navigateTo(entry.relPath);
      }
    },
    [navigateTo],
  );

  const showTip = useCallback((path: string, el: HTMLElement) => {
    setTipPath(path);
    setTipRect(el.getBoundingClientRect());
  }, []);
  const hideTip = useCallback(() => {
    setTipPath(null);
    setTipRect(null);
  }, []);

  const isEmpty = dirs.length === 0 && files.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {error && (
        <div className="shrink-0 px-4 py-2 bg-destructive/10 text-destructive text-xs border-b">
          {error}
        </div>
      )}
      {uploading && (
        <div className="shrink-0 px-4 py-3 bg-primary/5 text-primary text-xs border-b space-y-1.5">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>上传中 — {uploadProgress ? truncateMiddle(uploadProgress.name, 40) : '...'}</span>
            {uploadProgress && (
              <span className="ml-auto font-mono tabular-nums">{uploadProgress.progress.percent}%</span>
            )}
          </div>
          {uploadProgress && (
            <div className="h-1.5 w-full rounded-full bg-primary/15 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-150 ease-out"
                style={{ width: `${uploadProgress.progress.percent}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Section tabs */}
      <div className="shrink-0 border-b border-border bg-background/50 px-4 pt-3">
        <div className="flex items-center gap-1 mb-3">
          {RAW_SUBS.map((sub) => (
            <button
              key={sub}
              type="button"
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                activeSection === sub
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent',
              )}
              onClick={() => switchSection(sub)}
            >
              {categoryLabel(sub)}
            </button>
          ))}
        </div>

        {/* Navigation bar */}
        <div className="flex items-center gap-2 pb-2">
          <button
            type="button"
            className={cn(
              'flex items-center justify-center h-7 w-7 rounded-md transition-colors',
              canGoUp
                ? 'hover:bg-accent text-foreground'
                : 'text-muted-foreground/30 pointer-events-none',
            )}
            onClick={goUp}
            disabled={!canGoUp}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs">
            {breadcrumbs.map((seg, idx) => (
              <div key={seg.path} className="flex items-center gap-1">
                {idx > 0 && <span className="text-muted-foreground/40">/</span>}
                {idx === breadcrumbs.length - 1 ? (
                  <span className="font-medium text-foreground">{seg.label}</span>
                ) : (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => navigateTo(seg.path)}
                  >
                    {seg.label}
                  </button>
                )}
              </div>
            ))}
          </div>

          {isOriginals && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[11px] text-muted-foreground/50">
                支持文件拖放上传
              </span>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                上传文件
              </Button>
              <Button variant="outline" size="sm" onClick={() => folderInputRef.current?.click()}>
                <Folder className="h-3.5 w-3.5 mr-1.5" />
                上传文件夹
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div
            className={cn(
              'h-full',
              isOriginals && dragOver && !dropTargetDir && 'bg-primary/5 ring-2 ring-primary/30 ring-inset',
            )}
            onDragEnter={isOriginals ? handleDragEnter : undefined}
            onDragLeave={isOriginals ? handleDragLeave : undefined}
            onDragOver={isOriginals ? handleDragOver : undefined}
            onDrop={isOriginals ? handleDrop : undefined}
          >
            <ScrollArea className="h-full">
              <div className="p-4 min-h-full">
              {isEmpty ? (
                <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
                  <Folder className="h-12 w-12 text-muted-foreground/20" strokeWidth={1} />
                  <p className="text-sm text-muted-foreground">此目录为空</p>
                  {isOriginals && (
                    <p className="text-xs text-muted-foreground/60">
                      拖放文件到此处以上传
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3">
                  {/* Directories first */}
                  {dirs.map((dir) => {
                    const isDirDropTarget = isOriginals && dropTargetDir === dir.relPath;
                    return (
                      <button
                        key={dir.relPath}
                        type="button"
                        className={cn(
                          'flex flex-col items-center gap-1.5 p-3 rounded-lg transition-colors text-center',
                          'hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                          isDirDropTarget && 'bg-primary/10 ring-2 ring-primary/40',
                        )}
                        onDoubleClick={() => handleFileDoubleClick(dir)}
                        onDragEnter={isOriginals ? (e) => handleFolderDragEnter(e, dir.relPath) : undefined}
                        onDragLeave={isOriginals ? (e) => handleFolderDragLeave(e, dir.relPath) : undefined}
                        onDragOver={isOriginals ? handleDragOver : undefined}
                        onDrop={isOriginals ? (e) => handleFolderDrop(e, dir.relPath) : undefined}
                        title={`双击打开 ${dir.relPath.split('/').pop()}`}
                      >
                        <Folder className="h-10 w-10 text-amber-500/80" strokeWidth={1.25} />
                        <span className="text-[11px] leading-tight break-all line-clamp-2">
                          {dir.relPath.split('/').pop()}
                        </span>
                      </button>
                    );
                  })}

                  {/* Files */}
                  {files.map((f) => {
                    const status = statusMap.get(f.relPath);
                    const fileName = f.relPath.split('/').pop() ?? f.relPath;
                    return (
                      <div
                        key={f.relPath}
                        className={cn(
                          'flex flex-col items-center gap-1.5 p-3 rounded-lg transition-colors text-center',
                          'hover:bg-accent/70',
                        )}
                        onMouseEnter={(e) => showTip(f.relPath, e.currentTarget)}
                        onMouseLeave={hideTip}
                        onDoubleClick={() => setPreviewPath(f.relPath)}
                      >
                        {/* File icon with status badge */}
                        <div className="relative">
                          <File className="h-10 w-10 text-muted-foreground/60" strokeWidth={1.25} />
                          {status && (
                            <span className="absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-px">
                              <FileStatusIcon status={status.stage} />
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] leading-tight truncate w-full" title={fileName}>
                          {truncateMiddle(fileName)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
          </div>
        )}
      </div>

      {/* Hidden file input for button-triggered upload */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) {
            const entries = Array.from(files).map((f) => ({ file: f }));
            void uploadFiles(entries, browsePath);
          }
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />

      {/* Hidden folder input — preserves directory structure via webkitRelativePath */}
      <input
        ref={folderInputRef}
        type="file"
        /* @ts-expect-error webkitdirectory is widely supported */
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files?.length) {
            const entries = Array.from(files).map((f) => ({
              file: f,
              relativePath: (f as any).webkitRelativePath as string | undefined,
            }));
            void uploadFiles(entries, browsePath);
          }
          if (folderInputRef.current) folderInputRef.current.value = '';
        }}
      />

      <FilePreviewDialog
        open={previewPath !== null}
        relPath={previewPath}
        onOpenChange={(open) => { if (!open) setPreviewPath(null); }}
      />

      {/* Portal tooltip — avoids clipping by overflow containers */}
      {tipPath &&
        tipRect &&
        statusMap.get(tipPath) &&
        createPortal(
          <div
            className="fixed z-[9999] pointer-events-none whitespace-nowrap rounded-md bg-white px-2.5 py-1.5 text-[11px] text-gray-900 shadow-lg border dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
            style={{
              left: tipRect.left + tipRect.width / 2,
              top: tipRect.top - 6,
              transform: 'translate(-50%, -100%)',
            }}
          >
            {STAGE_TOOLTIPS[statusMap.get(tipPath)!.stage] ?? statusMap.get(tipPath)!.stage}
          </div>,
          document.body,
        )}
    </div>
  );
}
