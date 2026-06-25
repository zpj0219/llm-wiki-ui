import { useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, FileText, File, Folder, FolderUp, Loader2 } from 'lucide-react';
import { cn, isOriginalsSubDir, isWikiDirMarkdown, normPath } from '@/lib/utils';
import type { WikiFileEntry } from '@shared/types';

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
  selectedPath,
  onSelect,
  onFileDrop,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onFileDrop?: (files: FileList, targetDir: string) => Promise<void>;
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
            'flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-accent text-left',
            dragOver && 'bg-primary/10 ring-2 ring-primary/40',
            uploading && 'opacity-50 pointer-events-none',
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
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
          <span className="truncate">{node.name}</span>
          {isDropTarget && !dragOver && !uploading && (
            <span className="ml-auto text-[9px] text-muted-foreground/40 shrink-0">drop</span>
          )}
        </button>
        {open &&
          node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onFileDrop={onFileDrop}
            />
          ))}
      </div>
    );
  }

  const isWikiFile = isWikiDirMarkdown(node.path);

  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent text-left',
        isSelected && 'bg-primary/10 text-primary font-medium ring-1 ring-primary/20',
        !isWikiFile && isSelected && 'bg-primary/10 text-primary font-medium ring-1 ring-primary/20',
        !isWikiFile && !isSelected && 'text-muted-foreground',
      )}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
      onClick={() => onSelect(node.path)}
    >
      {isWikiFile ? (
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      )}
      <span className="truncate">{isWikiFile ? node.name.replace(/\.md$/i, '') : node.name}</span>
    </button>
  );
}

type WikiFileTreeProps = {
  files: WikiFileEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onFileDrop?: (files: FileList, targetDir: string) => Promise<void>;
};

export function WikiFileTree({ files, selectedPath, onSelect, onFileDrop }: WikiFileTreeProps) {
  const tree = useMemo(() => buildWikiTree(files), [files]);

  if (tree.length === 0) {
    return <p className="text-xs text-muted-foreground px-2 py-4">暂无 Wiki 页面</p>;
  }

  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onFileDrop={onFileDrop}
        />
      ))}
    </div>
  );
}
