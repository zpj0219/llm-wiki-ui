import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
  Trash2,
  Clock,
  ListChecks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn, truncateMiddle } from '@/lib/utils';
import type { UploadProgress } from '@/services/uploadApi';

export type UploadTaskStatus = 'queued' | 'uploading' | 'success' | 'failed';

export type UploadTask = {
  id: string;
  file: File;
  relativePath?: string;
  targetDir: string;
  displayName: string;
  status: UploadTaskStatus;
  progress: UploadProgress;
  error?: string;
  relPath?: string;
};

type UploadListDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: UploadTask[];
  onRetry: (id: string) => void;
  onRetryAllFailed: () => void;
  onClearFinished: () => void;
};

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function UploadListDialog({
  open,
  onOpenChange,
  tasks,
  onRetry,
  onRetryAllFailed,
  onClearFinished,
}: UploadListDialogProps) {
  const total = tasks.length;
  const successCount = tasks.filter((t) => t.status === 'success').length;
  const failedCount = tasks.filter((t) => t.status === 'failed').length;
  const uploadingCount = tasks.filter((t) => t.status === 'uploading').length;
  const queuedCount = tasks.filter((t) => t.status === 'queued').length;
  const hasFinished = successCount > 0 || failedCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ListChecks className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>上传列表</DialogTitle>
              <DialogDescription className="mt-1">
                关闭弹窗不会中断上传,可随时回来查看进度
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody>
          {/* Summary */}
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <span className="text-muted-foreground">
              共 <span className="font-medium text-foreground tabular-nums">{total}</span> 个
            </span>
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
            {hasFinished && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-2 text-[11px]"
                onClick={onClearFinished}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                清空已完成
              </Button>
            )}
          </div>

          {/* Task list */}
          {total === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <ListChecks className="h-10 w-10 text-muted-foreground/20" strokeWidth={1} />
              <p className="text-sm text-muted-foreground">暂无上传任务</p>
              <p className="text-xs text-muted-foreground/60">选择文件或拖放后会在此处显示</p>
            </div>
          ) : (
            <ScrollArea className="h-[min(48vh,360px)] -mx-1">
              <div className="px-1 space-y-1.5">
                {tasks.map((task) => (
                  <TaskRow key={task.id} task={task} onRetry={onRetry} />
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogBody>

        <DialogFooter>
          {failedCount > 0 && (
            <Button variant="outline" onClick={onRetryAllFailed} className="mr-auto">
              <RotateCcw className="h-4 w-4 mr-2" />
              全部重试失败({failedCount})
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskRow({
  task,
  onRetry,
}: {
  task: UploadTask;
  onRetry: (id: string) => void;
}) {
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
        {/* Status icon */}
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

        {/* Name */}
        <span
          className="min-w-0 flex-1 truncate text-xs"
          title={displayName}
        >
          {truncateMiddle(displayName, 40)}
        </span>

        {/* Size */}
        <span className="shrink-0 text-[11px] text-muted-foreground/60 font-mono tabular-nums">
          {formatSize(progress.total || task.file.size)}
        </span>

        {/* Percent / action */}
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

      {/* Progress bar for uploading */}
      {isUploading && (
        <div className="mt-1.5 h-1 w-full rounded-full bg-primary/15 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-150 ease-out"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      )}

      {/* Error message */}
      {isFailed && task.error && (
        <p className="mt-1 text-[11px] text-destructive/80 break-all line-clamp-2">
          {task.error}
        </p>
      )}

      {/* Success path */}
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
