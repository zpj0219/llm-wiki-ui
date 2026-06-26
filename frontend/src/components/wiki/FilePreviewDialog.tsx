import { useEffect, useState } from 'react';
import { File, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { readWikiPage } from '@/services/wikiApi';

type FilePreviewDialogProps = {
  open: boolean;
  relPath: string | null;
  onOpenChange: (open: boolean) => void;
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
  if (dot === -1) return true; // 无扩展名，尝试读取
  return PREVIEWABLE_EXTS.has(name.slice(dot).toLowerCase());
}

export function FilePreviewDialog({ open, relPath, onOpenChange }: FilePreviewDialogProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !relPath) {
      setContent(null);
      setError(null);
      return;
    }

    if (!canPreview(relPath)) {
      setLoading(false);
      setContent(null);
      setError(null);
      return;
    }

    setLoading(true);
    setContent(null);
    setError(null);
    void readWikiPage(relPath).then((res) => {
      setLoading(false);
      if (res.success) {
        setContent(res.content ?? null);
        setError(null);
      } else {
        setError(res.error ?? '读取失败');
      }
    });
  }, [open, relPath]);

  const fileName = relPath?.split('/').pop() ?? '';
  const isBinary = !canPreview(relPath ?? '') || (!loading && !error && content == null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <File className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{fileName}</span>
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="min-h-0 flex flex-col">
          {relPath && (
            <p className="text-[11px] text-muted-foreground font-mono truncate shrink-0">
              {relPath}
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <File className="h-10 w-10 text-muted-foreground/30" strokeWidth={1.25} />
              <p className="text-sm text-muted-foreground">读取文件失败</p>
              <p className="text-xs text-muted-foreground/60">{error}</p>
            </div>
          ) : isBinary ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <File className="h-10 w-10 text-muted-foreground/30" strokeWidth={1.25} />
              <div>
                <p className="text-sm font-medium text-muted-foreground">不支持预览此格式</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  二进制或不可读格式（PDF、DOCX、图片等），仅可下载查看
                </p>
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1 min-h-0">
              <pre className="text-xs font-mono whitespace-pre-wrap break-all p-4 bg-muted/30 rounded-md">
                {content}
              </pre>
            </ScrollArea>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
