import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { cn, normPath } from '@/lib/utils';
import type { OriginalsDirEntry } from '@/services/uploadApi';

type TreeNode = {
  name: string;
  path: string;
  children: TreeNode[];
};

function buildDirTree(entries: OriginalsDirEntry[]): TreeNode[] {
  const sorted = [...entries].sort((a, b) => a.relPath.localeCompare(b.relPath, 'zh-CN'));
  const dirMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const entry of sorted) {
    const path = normPath(entry.relPath);
    const node: TreeNode = { name: entry.name, path, children: [] };
    dirMap.set(path, node);

    const slash = path.lastIndexOf('/');
    const parentPath = slash > 0 ? path.slice(0, slash) : null;
    if (parentPath && dirMap.has(parentPath)) {
      dirMap.get(parentPath)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

function DirTreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 3);
  const isSelected = selectedPath === node.path;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          'flex w-full items-center gap-0.5 rounded-md text-xs',
          isSelected ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-accent'
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        <button
          type="button"
          className="flex h-7 w-6 shrink-0 items-center justify-center rounded hover:bg-accent/80"
          onClick={() => hasChildren && setOpen(!open)}
          aria-label={open ? '收起' : '展开'}
        >
          {hasChildren ? (
            open ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )
          ) : (
            <span className="w-3" />
          )}
        </button>
        <button
          type="button"
          className={cn(
            'flex flex-1 items-center gap-1.5 py-1.5 pr-2 text-left min-w-0',
            isSelected && 'text-primary font-medium'
          )}
          onClick={() => onSelect(node.path)}
        >
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{node.name}</span>
        </button>
      </div>
      {open &&
        node.children.map((child) => (
          <DirTreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

type OriginalsDirTreeProps = {
  directories: OriginalsDirEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  disabled?: boolean;
  className?: string;
};

export function OriginalsDirTree({
  directories,
  selectedPath,
  onSelect,
  disabled,
  className,
}: OriginalsDirTreeProps) {
  const tree = useMemo(() => buildDirTree(directories), [directories]);

  if (directories.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-2 py-4">暂无 originals 目录，请先创建 raw/originals</p>
    );
  }

  return (
    <div
      className={cn(
        'rounded-md border border-input bg-background max-h-48 overflow-y-auto p-1',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      {tree.map((node) => (
        <DirTreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
