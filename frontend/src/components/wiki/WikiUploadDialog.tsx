import { Upload, Loader2, CheckCircle2, AlertCircle, FolderUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { OriginalsDirTree } from '@/components/wiki/OriginalsDirTree';
import {
  listOriginalsDirs,
  uploadOriginal,
  type OriginalsDirEntry,
} from '@/services/uploadApi';
import { cn } from '@/lib/utils';

type WikiUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded?: () => void;
};

const DEFAULT_TARGET = 'raw/originals/maintenance/manuals';

export function WikiUploadDialog({ open, onOpenChange, onUploaded }: WikiUploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [directories, setDirectories] = useState<OriginalsDirEntry[]>([]);
  const [targetDir, setTargetDir] = useState(DEFAULT_TARGET);
  const [dirsLoading, setDirsLoading] = useState(false);
  const [dirsError, setDirsError] = useState<string | null>(null);
  const [toInbox, setToInbox] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setDirsError(null);
    setDirsLoading(true);
    void listOriginalsDirs().then((res) => {
      setDirsLoading(false);
      if (!res.success) {
        setDirsError(res.error ?? '加载目录失败');
        setDirectories([]);
        return;
      }
      setDirectories(res.directories);
      const paths = new Set(res.directories.map((d) => d.relPath));
      if (paths.has(DEFAULT_TARGET)) {
        setTargetDir(DEFAULT_TARGET);
      } else if (res.directories.length > 0) {
        setTargetDir(res.directories[res.directories.length - 1]!.relPath);
      }
    });
  }, [open]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      if (!toInbox && !targetDir) return;

      setUploading(true);
      setResult(null);

      const outcomes: string[] = [];
      let anyOk = false;

      for (const file of Array.from(files)) {
        const res = await uploadOriginal(file, { targetDir, toInbox });
        if (res.success) {
          anyOk = true;
          outcomes.push(`${file.name} → ${res.relPath}`);
        } else {
          outcomes.push(`${file.name}: ${res.error ?? '失败'}`);
        }
      }

      setUploading(false);
      setResult({
        ok: anyOk,
        text: outcomes.join('\n'),
      });
      if (anyOk) onUploaded?.();
      if (inputRef.current) inputRef.current.value = '';
    },
    [targetDir, toInbox, onUploaded]
  );

  const handleClose = () => {
    if (uploading) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={handleClose} className="relative">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderUp className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>上传原件</DialogTitle>
              <DialogDescription className="mt-1">
                写入知识库 raw 目录，由 Hermes 定时任务自动处理
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody>
          <p className="text-xs text-muted-foreground leading-relaxed rounded-lg bg-muted/40 px-3 py-2.5">
            选择{' '}
            <code className="text-[10px] bg-background px-1 rounded">raw/originals/</code>{' '}
            下的目标目录，流水线：originals → fulltext → wiki ingest → qmd 索引。
          </p>

          <div className="grid gap-2">
            <Label>目标目录</Label>
            {dirsLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载目录…
              </div>
            ) : dirsError ? (
              <p className="text-sm text-destructive py-4">{dirsError}</p>
            ) : (
              <>
                <OriginalsDirTree
                  directories={directories}
                  selectedPath={toInbox ? null : targetDir}
                  onSelect={setTargetDir}
                  disabled={uploading || toInbox}
                />
                {!toInbox && targetDir && (
                  <p className="text-xs text-muted-foreground font-mono truncate" title={targetDir}>
                    {targetDir}/
                  </p>
                )}
              </>
            )}
            {toInbox && (
              <p className="text-xs text-muted-foreground">已选择 inbox 暂存，将写入 raw/inbox/</p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={toInbox}
              onChange={(e) => setToInbox(e.target.checked)}
              disabled={uploading}
              className="rounded border-input"
            />
            先放入 inbox 暂存（raw/inbox/）
          </label>

          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />

          {result && (
            <div
              className={cn(
                'flex gap-2 rounded-lg border p-3 text-sm whitespace-pre-line',
                result.ok
                  ? 'border-green-500/30 bg-green-500/5 text-green-800 dark:text-green-300'
                  : 'border-destructive/30 bg-destructive/5 text-destructive'
              )}
            >
              {result.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <span>{result.text}</span>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={uploading}>
            关闭
          </Button>
          <Button
            type="button"
            disabled={uploading || dirsLoading || (!toInbox && !targetDir)}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                上传中…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                选择文件
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
