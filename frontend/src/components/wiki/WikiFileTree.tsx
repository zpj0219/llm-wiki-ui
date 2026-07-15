import { createPortal } from 'react-dom';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, CircleCheck, Clock, FileCheck, FileText, File, Folder, FolderUp, Loader2 } from 'lucide-react';
import { categoryLabel, cn, isOriginalsSubDir, isWikiDirMarkdown, normPath } from '@/lib/utils';
import type { OriginalsFileStatus, WikiFileEntry } from '@shared/types';

type TreeNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  children: TreeNode[];
};

function buildWikiTree(files: WikiFileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();

  const ensureDir = (dirPath: string, name: string): TreeNode => {
    const key = normPath(dirPath);
    if (dirMap.has(key)) return dirMap.get(key)!;
    const node: TreeNode = { name, path: key, isDirectory: true, children: [] };
    dirMap.set(key, node);
    const parentPath = key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : null;
    if (!parentPath) {
      if (!root.some((n) => n.path === key)) root.push(node);
    } else {
      const parent = dirMap.get(parentPath);
      if (parent && !parent.children.some((c) => c.path === key)) parent.children.push(node);
      else if (!root.some((n) => n.path === key)) root.push(node);
    }
    return node;
  };

  for (const f of files) {
    const p = normPath(f.relPath);
    if (p !== 'wiki' && !p.startsWith('wiki/') && p !== 'raw' && !p.startsWith('raw/')) continue;

    if (f.isDirectory) {
      const name = p.split('/').pop() ?? p;
      ensureDir(p, name);
      continue;
    }

    if (isWikiDirMarkdown(p)) {
      const within = p.replace(/^wiki\/?/i, '');
      const segments = within.split('/').filter(Boolean);
      const dirSegments = segments.length > 1 ? segments.slice(0, -1) : [];
      for (let i = 0; i < dirSegments.length; i++) {
        ensureDir(`wiki/${dirSegments.slice(0, i + 1).join('/')}`, dirSegments[i]!);
      }
      const name = segments[segments.length - 1] ?? p;
      const node: TreeNode = { name, path: p, isDirectory: false, children: [] };
      const parentRel = dirSegments.length > 0 ? `wiki/${dirSegments.join('/')}` : 'wiki';
      const parent = dirMap.get(parentRel);
      if (parent) parent.children.push(node);
      else root.push(node);
    } else if (p.startsWith('raw/')) {
      /* raw/ 下上传的原件文件 */
      const segments = p.split('/').filter(Boolean);
      const dirSegments = segments.length > 1 ? segments.slice(0, -1) : [];
      for (let i = 0; i < dirSegments.length; i++) {
        ensureDir(dirSegments.slice(0, i + 1).join('/'), dirSegments[i]!);
      }
      const name = segments[segments.length - 1] ?? p;
      const node: TreeNode = { name, path: p, isDirectory: false, children: [] };
      const parentDir = dirSegments.length > 0 ? dirSegments.join('/') : null;
      if (parentDir) {
        const parent = dirMap.get(parentDir);
        if (parent) parent.children.push(node);
        else root.push(node);
      } else {
        root.push(node);
      }
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      // index.md always on top of its directory group
      const aIdx = a.name === 'index.md' ? 0 : 1;
      const bIdx = b.name === 'index.md' ? 0 : 1;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(root);
  return root;
}

function TreeItem({
  node,
  depth,
  baseIndent,
  selectedPath,
  onSelect,
  onFileDrop,
  statusMap,
}: {
  node: TreeNode;
  depth: number;
  baseIndent: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onFileDrop?: (files: FileList, targetDir: string) => Promise<void>;
  statusMap?: Map<string, OriginalsFileStatus>;
}) {
  const [open, setOpen] = useState(depth < 2);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dragCounter = useRef(0);
  const isSelected = selectedPath === node.path;
  const isDropTarget = node.isDirectory && isOriginalsSubDir(node.path);

  if (node.isDirectory) {
    const handleDragEnter = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
        setDragOver(true);
      }
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setDragOver(false);
      }
    };

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setDragOver(false);
      const files = e.dataTransfer.files;
      if (!files?.length || !onFileDrop) return;
      setUploading(true);
      try {
        await onFileDrop(files, node.path);
        setOpen(true);
      } finally {
        setUploading(false);
      }
    };

    return (
      <div>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-1 py-1 text-xs hover:bg-accent text-left min-w-0',
            dragOver && 'bg-primary/10 ring-2 ring-primary/40',
            uploading && 'opacity-50 pointer-events-none',
          )}
          style={{ paddingLeft: `${baseIndent + 8 + depth * 14}px`, paddingRight: '8px' }}
          onClick={() => !uploading && setOpen(!open)}
          onDragEnter={isDropTarget ? handleDragEnter : undefined}
          onDragLeave={isDropTarget ? handleDragLeave : undefined}
          onDragOver={isDropTarget ? handleDragOver : undefined}
          onDrop={isDropTarget ? handleDrop : undefined}
        >
          {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground animate-spin" />
          ) : dragOver ? (
            <FolderUp className="h-3.5 w-3.5 shrink-0 text-primary" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{categoryLabel(node.path)}</span>
        </button>
        {open &&
          node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              baseIndent={baseIndent}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onFileDrop={onFileDrop}
              statusMap={statusMap}
            />
          ))}
      </div>
    );
  }

  const isWikiFile = isWikiDirMarkdown(node.path);
  const fileStatus = !isWikiFile ? statusMap?.get(node.path) : undefined;
  const iconRef = useRef<HTMLSpanElement>(null);
  const [tipRect, setTipRect] = useState<DOMRect | null>(null);

  const showTip = useCallback(() => {
    if (iconRef.current) setTipRect(iconRef.current.getBoundingClientRect());
  }, []);
  const hideTip = useCallback(() => setTipRect(null), []);

  const stageLabel =
    fileStatus?.stage === 'uploaded'
      ? '待处理 — 等待全文提取'
      : fileStatus?.stage === 'fulltext'
        ? '已提取全文 — 等待实体生成'
        : '已生成实体 — 知识条目已可用';

  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-1.5 py-1.5 text-xs transition-colors hover:bg-accent text-left min-w-0',
        isSelected && 'text-foreground font-medium',
        !isSelected && 'text-muted-foreground/70',
      )}
      style={{ paddingLeft: `${baseIndent + 8 + depth * 14 + 18}px`, paddingRight: '8px' }}
      onClick={() => onSelect(node.path)}
    >
      {isWikiFile ? (
        <FileText className={cn('h-3.5 w-3.5 shrink-0', isSelected ? 'text-foreground' : 'text-muted-foreground/70')} />
      ) : (
        <File className={cn('h-3.5 w-3.5 shrink-0', isSelected ? 'text-foreground' : 'text-muted-foreground/70')} />
      )}
      <span className="truncate">{isWikiFile ? node.name.replace(/\.md$/i, '') : node.name}</span>
      {fileStatus && (
        <span
          ref={iconRef}
          className="shrink-0 ml-auto"
          onMouseEnter={showTip}
          onMouseLeave={hideTip}
        >
          {fileStatus.stage === 'uploaded' ? (
            <Clock className="h-3.5 w-3.5 text-amber-500" />
          ) : fileStatus.stage === 'fulltext' ? (
            <FileCheck className="h-3.5 w-3.5 text-blue-500" />
          ) : (
            <CircleCheck className="h-3.5 w-3.5 text-green-500" />
          )}
        </span>
      )}
      {tipRect &&
        fileStatus &&
        createPortal(
          <div
            className="fixed z-[9999] pointer-events-none whitespace-nowrap rounded-md bg-white px-2.5 py-1.5 text-[11px] text-gray-900 shadow-lg border dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
            style={{
              left: tipRect.left + tipRect.width / 2,
              top: tipRect.top - 6,
              transform: 'translate(-50%, -100%)',
            }}
          >
            {stageLabel}
          </div>,
          document.body,
        )}
    </button>
  );
}

type WikiFileTreeProps = {
  files: WikiFileEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onFileDrop?: (files: FileList, targetDir: string) => Promise<void>;
  statusMap?: Map<string, OriginalsFileStatus>;
  /** 只展示该路径下的子树 */
  rootPath?: string;
  /** 内容层级的基础缩进；行背景始终保持全宽 */
  baseIndent?: number;
};

function _findSubtree(roots: TreeNode[], targetPath: string): TreeNode[] {
  for (const node of roots) {
    if (node.path === targetPath) return node.children;
    if (node.isDirectory && targetPath.startsWith(node.path + '/')) {
      const found = _findSubtree(node.children, targetPath);
      if (found.length > 0 || node.path === targetPath) return found;
    }
  }
  return [];
}

export function WikiFileTree({
  files,
  selectedPath,
  onSelect,
  onFileDrop,
  statusMap,
  rootPath,
  baseIndent = 0,
}: WikiFileTreeProps) {
  const fullTree = useMemo(() => buildWikiTree(files), [files]);
  const tree = useMemo(() => {
    if (!rootPath) return fullTree;
    return _findSubtree(fullTree, normPath(rootPath));
  }, [fullTree, rootPath]);

  if (tree.length === 0) {
    return (
      <p className="py-4 pr-2 text-xs text-muted-foreground" style={{ paddingLeft: `${baseIndent + 8}px` }}>
        暂无内容
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          baseIndent={baseIndent}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onFileDrop={onFileDrop}
          statusMap={statusMap}
        />
      ))}
    </div>
  );
}
