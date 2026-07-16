import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, AlertCircle, CircleCheck, Clock, Download, File, FileCheck, Folder, Loader2, ListChecks, RotateCcw, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

import { categoryLabel, cn, normPath, truncateMiddle } from '@/lib/utils';
import { listWikiEntries, getOriginalsStatus, ensureDir, deleteWikiEntry, downloadWikiFile } from '@/services/wikiApi';
import { uploadOriginalWithProgress } from '@/services/uploadApi';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { FilePreviewDialog } from './FilePreviewDialog';
import { type UploadTask } from './UploadListDialog';
import type { OriginalsFileStatus, WikiFileEntry } from '@shared/types';

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

type WikiRawFilesPanelProps = {
  refreshKey?: number;
};

const RAW_SUBS = ['raw/originals', 'raw/fulltext', 'raw/inbox'];
const UPLOAD_SECTION = 'upload-list';

/** 并发上传上限 */
const MAX_CONCURRENT = 3;

/** 稳定的任务 ID 生成器(应用运行时,非 workflow 脚本) */
let taskSeq = 0;
const nextTaskId = () => `upload-${++taskSeq}`;

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

function UploadListContent({
  tasks,
  onRetry,
  onRetryAllFailed,
  onClearFinished,
}: {
  tasks: UploadTask[];
  onRetry: (id: string) => void;
  onRetryAllFailed: () => void;
  onClearFinished: () => void;
}) {
  const total = tasks.length;
  const successCount = tasks.filter((t) => t.status === 'success').length;
  const failedCount = tasks.filter((t) => t.status === 'failed').length;
  const uploadingCount = tasks.filter((t) => t.status === 'uploading').length;
  const queuedCount = tasks.filter((t) => t.status === 'queued').length;
  const hasFinished = successCount > 0 || failedCount > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      <div className="shrink-0 flex items-center gap-3 flex-wrap text-xs px-4 py-2 border-b">
        <div className="flex items-center gap-1.5">
          <ListChecks className="h-4 w-4 text-primary/70" />
          <span className="text-muted-foreground">
            共 <span className="font-medium text-foreground tabular-nums">{total}</span> 个
          </span>
        </div>
        {uploadingCount > 0 && (
          <span className="flex items-center gap-1 text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            进行中 {uploadingCount}
          </span>
        )}
        {queuedCount > 0 && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            排队 {queuedCount}
          </span>
        )}
        {successCount > 0 && (
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            成功 {successCount}
          </span>
        )}
        {failedCount > 0 && (
          <span className="flex items-center gap-1 text-destructive">
            <AlertCircle className="h-3 w-3" />
            失败 {failedCount}
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          {failedCount > 0 && (
            <Button variant="outline" size="sm" onClick={onRetryAllFailed}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              全部重试({failedCount})
            </Button>
          )}
          {hasFinished && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={onClearFinished}>
              <Trash2 className="h-3 w-3 mr-1" />
              清空已完成
            </Button>
          )}
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 min-h-0">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <ListChecks className="h-10 w-10 text-muted-foreground/20" strokeWidth={1} />
            <p className="text-sm text-muted-foreground">暂无上传任务</p>
            <p className="text-xs text-muted-foreground/60">选择文件或拖放后会在此处显示</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-4 space-y-1.5">
              {tasks.map((task) => (
                <UploadTaskRow key={task.id} task={task} onRetry={onRetry} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

function UploadTaskRow({ task, onRetry }: { task: UploadTask; onRetry: (id: string) => void }) {
  const { status, progress, displayName } = task;
  const isFailed = status === 'failed';
  const isUploading = status === 'uploading';
  const isQueued = status === 'queued';

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 transition-colors',
        isFailed
          ? 'border-destructive/30 bg-destructive/5'
          : isUploading
            ? 'border-primary/30 bg-primary/5'
            : 'border-border bg-card',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0">
          {status === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          ) : isFailed ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : isUploading ? (
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground/60" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs" title={displayName}>
          {truncateMiddle(displayName, 40)}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground/60 font-mono tabular-nums">
          {formatSize(progress.total || task.file.size)}
        </span>
        {isUploading && (
          <span className="shrink-0 text-[11px] font-mono tabular-nums text-primary w-9 text-right">
            {progress.percent}%
          </span>
        )}
        {isFailed && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 h-6 px-2 text-[11px] text-destructive hover:text-destructive"
            onClick={() => onRetry(task.id)}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            重试
          </Button>
        )}
      </div>
      {isUploading && (
        <div className="mt-1.5 h-1 w-full rounded-full bg-primary/15 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-150 ease-out"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      )}
      {isFailed && task.error && (
        <p className="mt-1 text-[11px] text-destructive/80 break-all line-clamp-2">{task.error}</p>
      )}
      {status === 'success' && task.relPath && (
        <p className="mt-0.5 text-[11px] text-muted-foreground/50 font-mono truncate" title={task.relPath}>
          → {task.relPath}
        </p>
      )}
      {isQueued && (
        <p className="mt-0.5 text-[11px] text-muted-foreground/50">等待上传…</p>
      )}
    </div>
  );
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

/** Unix timestamp (秒) → 紧凑日期字符串 */
function formatMtime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const sameYear = d.getFullYear() === now.getFullYear();
  const datePart = sameYear
    ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${datePart} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Navigation state
  const [activeSection, setActiveSection] = useState<string>('raw/originals');
  const [browsePath, setBrowsePath] = useState<string>('raw/originals');

  // Tooltip state (portal-based to avoid clipping)
  const [tipPath, setTipPath] = useState<string | null>(null);
  const [tipRect, setTipRect] = useState<DOMRect | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{
    relPath: string;
    name: string;
    isDirectory: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [entriesRes, statusRes] = await Promise.all([
      listWikiEntries({ force: true }),
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
    if (sub !== UPLOAD_SECTION) {
      setBrowsePath(sub);
    }
  }, []);

  const { dirs, files } = useMemo(
    () => getDirectChildren(allFiles, browsePath),
    [allFiles, browsePath],
  );

  const canGoUp = browsePath !== activeSection && activeSection !== UPLOAD_SECTION;
  const isOriginals = activeSection === 'raw/originals';
  const isUploadList = activeSection === UPLOAD_SECTION;

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

  const updateTask = useCallback((id: string, patch: Partial<UploadTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  // 持有最新 tasks 的引用,供调度器读取而无需进入依赖
  const tasksRef = useRef<UploadTask[]>([]);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  /** 启动单个任务:置 uploading → 上传 → 置 success/failed → pump 推进 */
  const startTask = useCallback(
    async (task: UploadTask) => {
      updateTask(task.id, {
        status: 'uploading',
        progress: { loaded: 0, total: task.file.size, percent: 0 },
      });

      const res = await uploadOriginalWithProgress(
        task.file,
        { targetDir: task.targetDir },
        (progress) => updateTask(task.id, { progress }),
      );

      if (res.success) {
        updateTask(task.id, { status: 'success', relPath: res.relPath, error: undefined });
      } else if (res.reason === 'duplicate') {
        const dupPath = res.existingPath ?? '未知路径';
        const dupDisplay = dupPath.startsWith('raw/originals/') ? dupPath.slice('raw/originals/'.length) : dupPath;
        updateTask(task.id, { status: 'failed', error: `文件重复 — 已存在于 ${dupDisplay}` });
      } else {
        updateTask(task.id, { status: 'failed', error: res.error ?? '上传失败' });
      }
      // 任务结束后由 useEffect 监听 tasks 变化统一推进 pump 与完成检测
    },
    [updateTask],
  );

  /** 从队列中取排队任务填充空闲并发槽 */
  const pumpQueue = useCallback(() => {
    const snapshot = tasksRef.current;
    const running = snapshot.filter((t) => t.status === 'uploading').length;
    const slots = MAX_CONCURRENT - running;
    if (slots <= 0) return;

    const toStart = snapshot.filter((t) => t.status === 'queued').slice(0, slots);
    for (const task of toStart) {
      void startTask(task);
    }
  }, [startTask]);

  // 任务列表变化时驱动调度:pump 空闲槽 + 全部完成时刷新
  const finishingRef = useRef(false);
  useEffect(() => {
    pumpQueue();
    const snapshot = tasksRef.current;
    const active = snapshot.some((t) => t.status === 'queued' || t.status === 'uploading');
    if (!active && !finishingRef.current && snapshot.length > 0) {
      finishingRef.current = true;
      void (async () => {
        await fetchData();
        const failed = tasksRef.current.filter((t) => t.status === 'failed');
        if (failed.length > 0) {
          setError(`上传完成,${failed.length} 个文件失败 — 详见上传列表`);
        } else {
          setError(null);
        }
        finishingRef.current = false;
      })();
    }
  }, [tasks, pumpQueue, fetchData]);

  /** 入队上传:把文件条目转为任务并入队(调度由 useEffect 驱动) */
  const enqueueUploads = useCallback((entries: FileEntry[], baseTargetDir: string) => {
    const newTasks: UploadTask[] = entries.map(({ file, relativePath }) => {
      const displayName = relativePath ?? file.name;
      // 文件夹/拖放:含子目录时拼到 base 上,与原逻辑一致
      let targetDir = baseTargetDir;
      if (relativePath && relativePath.includes('/')) {
        const folderPath = relativePath.slice(0, relativePath.lastIndexOf('/'));
        targetDir = normPath(`${baseTargetDir}/${folderPath}`);
      }
      return {
        id: nextTaskId(),
        file,
        relativePath,
        targetDir,
        displayName,
        status: 'queued' as const,
        progress: { loaded: 0, total: file.size, percent: 0 },
      };
    });

    setError(null);
    setTasks((prev) => [...prev, ...newTasks]);
  }, []);

  /** 重试单个失败任务 */
  const retryTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: 'queued', progress: { loaded: 0, total: t.file.size, percent: 0 }, error: undefined }
          : t,
      ),
    );
  }, []);

  /** 重试所有失败任务 */
  const retryAllFailed = useCallback(() => {
    setTasks((prev) =>
      prev.map((t) =>
        t.status === 'failed'
          ? { ...t, status: 'queued', progress: { loaded: 0, total: t.file.size, percent: 0 }, error: undefined }
          : t,
      ),
    );
  }, []);

  /** 清空已完成的任务(成功 + 失败) */
  const clearFinished = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status !== 'success' && t.status !== 'failed'));
  }, []);

  /** 删除条目（需确认后调用） */
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteWikiEntry(deleteTarget.relPath);
    setDeleting(false);
    setDeleteTarget(null);
    if (res.success) {
      await fetchData();
      setError(null);
    } else {
      setError(res.error ?? '删除失败');
    }
  }, [deleteTarget, fetchData]);

  /** 下载文件 */
  const handleDownload = useCallback(async (relPath: string) => {
    const res = await downloadWikiFile(relPath);
    if (!res.success) {
      setError(res.error ?? '下载失败');
    }
  }, []);

  // 派生:进行中数量,用于按钮角标与 banner
  const uploadingCount = tasks.filter((t) => t.status === 'uploading').length;
  const pendingCount = tasks.filter((t) => t.status === 'uploading' || t.status === 'queued').length;

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
          enqueueUploads(files, targetDir);
        }
        // Create empty directories and refresh
        const created = await createEmptyDirs(dirPaths, files, targetDir);
        if (created) await fetchData();
      } else {
        const fileList = e.dataTransfer.files;
        if (fileList?.length) {
          const entries = Array.from(fileList).map((f) => ({ file: f }));
          enqueueUploads(entries, targetDir);
        }
      }
      setDropTargetDir(null);
    },
    [browsePath, dropTargetDir, enqueueUploads, fetchData],
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
          enqueueUploads(files, dirPath);
        }
        const created = await createEmptyDirs(dirPaths, files, dirPath);
        if (created) await fetchData();
      } else {
        const fileList = e.dataTransfer.files;
        if (fileList?.length) {
          const entries = Array.from(fileList).map((f) => ({ file: f }));
          enqueueUploads(entries, dirPath);
        }
      }
    },
    [enqueueUploads, fetchData],
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
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {error && (
        <div className="shrink-0 px-4 py-2 bg-destructive/10 text-destructive text-xs border-b truncate">
          {error}
        </div>
      )}
      {pendingCount > 0 && !isUploadList && (
        <button
          type="button"
          onClick={() => switchSection(UPLOAD_SECTION)}
          className="shrink-0 w-full px-4 py-2 bg-primary/5 text-primary text-xs border-b hover:bg-primary/10 transition-colors text-left"
        >
          <span className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>
              上传中 — {uploadingCount} 个进行中{pendingCount > uploadingCount ? `,${pendingCount - uploadingCount} 个排队` : ''}
            </span>
            <span className="ml-auto text-primary/70">查看列表 →</span>
          </span>
        </button>
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
          <button
            type="button"
            className={cn(
              'relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              isUploadList
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent',
            )}
            onClick={() => switchSection(UPLOAD_SECTION)}
          >
            <span className="flex items-center gap-1.5">
              上传列表
              {pendingCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                  {pendingCount}
                </span>
              )}
            </span>
          </button>
        </div>

        {/* Navigation bar — hidden on upload list */}
        {!isUploadList && (
        <div className="flex items-center gap-2 pb-2 flex-wrap">
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
          <div className="flex items-center gap-1 text-xs min-w-0 overflow-hidden">
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
              <span className="hidden sm:inline text-[11px] text-muted-foreground/50">
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
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isUploadList ? (
          <UploadListContent
            tasks={tasks}
            onRetry={retryTask}
            onRetryAllFailed={retryAllFailed}
            onClearFinished={clearFinished}
          />
        ) : loading ? (
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
                <div className="flex flex-col gap-px">
                  {/* Column header — flex layout, widths match data rows exactly */}
                  <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-muted-foreground/50 border-b border-border/50 pb-1.5 mb-1 select-none">
                    <div className="w-10 shrink-0" />
                    <div className="flex-[5] min-w-0">名称</div>
                    <div className="flex-[1] inline-flex justify-center"><span className="w-10 text-center">类型</span></div>
                    <div className="flex-[1.5] inline-flex justify-center"><span className="w-[72px] text-center">状态</span></div>
                    <div className="flex-[2] inline-flex justify-center"><span className="w-[110px] text-center">修改时间</span></div>
                    <div className="flex-[1] inline-flex justify-end pr-1">操作</div>
                  </div>
                  {/* Directories first */}
                  {dirs.map((dir) => {
                    const isDirDropTarget = isOriginals && dropTargetDir === dir.relPath;
                    const dirName = dir.relPath.split('/').pop() ?? '';
                    return (
                      <div
                        key={dir.relPath}
                        className={cn(
                          'flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors',
                          'hover:bg-accent/70',
                          isDirDropTarget && 'bg-primary/10 ring-2 ring-primary/40',
                        )}
                        onClick={() => handleFileDoubleClick(dir)}
                        onDragEnter={isOriginals ? (e) => handleFolderDragEnter(e, dir.relPath) : undefined}
                        onDragLeave={isOriginals ? (e) => handleFolderDragLeave(e, dir.relPath) : undefined}
                        onDragOver={isOriginals ? handleDragOver : undefined}
                        onDrop={isOriginals ? (e) => handleFolderDrop(e, dir.relPath) : undefined}
                        title={`点击打开 ${dirName}`}
                      >
                        <Folder className="h-10 w-10 shrink-0 text-amber-500/80" strokeWidth={1.25} />
                        <span className="flex-[5] min-w-0 text-xs truncate">{dirName}</span>
                        <span className="hidden sm:flex flex-[1] justify-center">
                          <span className="inline-flex justify-center w-10 text-[10px] text-muted-foreground/70 bg-muted/30 px-1 py-0.5 rounded truncate">
                            目录
                          </span>
                        </span>
                        <span className="hidden sm:flex flex-[1.5] justify-center">
                          <span className="inline-flex justify-center w-[72px] text-[11px] text-muted-foreground/40">
                            —
                          </span>
                        </span>
                        <span className="hidden sm:flex flex-[2] justify-center">
                          <span className="inline-flex justify-center w-[110px] text-[11px] text-muted-foreground/40 font-mono tabular-nums">
                            —
                          </span>
                        </span>
                        <div className="hidden sm:flex flex-[1] shrink-0 items-center gap-0.5 justify-end">
                          {isOriginals && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title={`删除文件夹 ${dirName}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({ relPath: dir.relPath, name: dirName, isDirectory: true });
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Files */}
                  {files.map((f) => {
                    const status = statusMap.get(f.relPath);
                    const fileName = f.relPath.split('/').pop() ?? f.relPath;
                    const ext = fileName.includes('.') ? fileName.split('.').pop()?.toUpperCase() : null;
                    const statusLabel =
                      status?.stage === 'uploaded' ? '待处理'
                      : status?.stage === 'fulltext' ? '全文已提取'
                      : status?.stage === 'wiki' ? '已生成实体'
                      : null;
                    const mtime = f.modifiedAt ? formatMtime(f.modifiedAt) : null;
                    return (
                      <div
                        key={f.relPath}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors hover:bg-accent/70"
                        onMouseEnter={(e) => showTip(f.relPath, e.currentTarget)}
                        onMouseLeave={hideTip}
                        onClick={() => setPreviewPath(f.relPath)}
                      >
                        {/* Icon */}
                        <div className="relative shrink-0">
                          <File className="h-10 w-10 text-muted-foreground/60" strokeWidth={1.25} />
                          {status && (
                            <span className="absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-px">
                              <FileStatusIcon status={status.stage} />
                            </span>
                          )}
                        </div>
                        {/* Name */}
                        <span className="flex-[5] min-w-0 text-xs truncate" title={fileName}>
                          {fileName}
                        </span>
                        {/* Type badge */}
                        <span className="hidden sm:flex flex-[1] justify-center">
                          <span className="inline-flex justify-center w-10 text-[10px] font-mono text-muted-foreground/70 bg-muted/30 px-1 py-0.5 rounded tracking-wide truncate">
                            {ext ?? '—'}
                          </span>
                        </span>
                        {/* Status label */}
                        <span className="hidden sm:flex flex-[1.5] justify-center">
                          <span className={cn(
                            'inline-flex justify-center w-[72px] text-[11px] whitespace-nowrap truncate',
                            status?.stage === 'uploaded' && 'text-amber-600',
                            status?.stage === 'fulltext' && 'text-blue-600',
                            status?.stage === 'wiki' && 'text-green-600',
                            !statusLabel && 'text-muted-foreground/50',
                          )}>
                            {statusLabel ?? '—'}
                          </span>
                        </span>
                        {/* Modified time */}
                        <span className="hidden sm:flex flex-[2] justify-center">
                          <span className="inline-flex justify-center w-[110px] text-[11px] text-muted-foreground/70 font-mono tabular-nums truncate">
                            {mtime ?? '—'}
                          </span>
                        </span>
                        {/* Actions */}
                        <div className="hidden sm:flex flex-[1] items-center gap-0.5 justify-end">
                          {isOriginals && (
                            <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:bg-accent hover:text-foreground"
                              title={`下载 ${fileName}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDownload(f.relPath);
                              }}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title={`删除文件 ${fileName}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({ relPath: f.relPath, name: fileName, isDirectory: false });
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            </>
                          )}
                        </div>
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
            enqueueUploads(entries, browsePath);
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
            enqueueUploads(entries, browsePath);
          }
          if (folderInputRef.current) folderInputRef.current.value = '';
        }}
      />

      <FilePreviewDialog
        open={previewPath !== null}
        relPath={previewPath}
        resolveInitialWikiPath={false}
        onOpenChange={(open) => { if (!open) setPreviewPath(null); }}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <Trash2 className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle>确认删除</DialogTitle>
                <DialogDescription className="mt-1">
                  {deleteTarget?.isDirectory
                    ? '将永久删除文件夹及其所有内容'
                    : '将永久删除该文件'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogBody>
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2.5">
              {deleteTarget?.isDirectory ? (
                <Folder className="h-5 w-5 shrink-0 text-amber-500/80" strokeWidth={1.25} />
              ) : (
                <File className="h-5 w-5 shrink-0 text-muted-foreground/60" strokeWidth={1.25} />
              )}
              <span className="text-sm font-medium truncate">{deleteTarget?.name ?? ''}</span>
            </div>
            <p className="mt-3 text-xs text-destructive">此操作不可撤销，请谨慎操作。</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { void handleDelete(); }}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  删除中…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  确认删除
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
