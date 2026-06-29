import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normPath(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function isWikiDirMarkdown(relPath: string): boolean {
  const p = normPath(relPath);
  return p.startsWith('wiki/') && p.endsWith('.md');
}

/** raw/originals 及其子孙目录均接受拖放上传 */
export function isOriginalsSubDir(relPath: string): boolean {
  const p = normPath(relPath);
  return p === 'raw/originals' || p.startsWith('raw/originals/');
}

export function titleFromPath(relPath: string): string {
  const base = relPath.split('/').pop() ?? relPath;
  return base.replace(/\.md$/i, '');
}

const CATEGORY_LABELS: Record<string, string> = {
  'raw/originals': '文件',
  'raw/fulltext': '全文',
  'raw/inbox': '暂存',
  'wiki/entities': '实体',
  'wiki/topics': '主题',
  'wiki/sources': '来源',
};

/** 返回路径对应的中文类别标签，未匹配时返回原始名称 */
export function categoryLabel(relPath: string): string {
  const p = normPath(relPath);
  if (CATEGORY_LABELS[p]) return CATEGORY_LABELS[p];
  // 也匹配路径的最后一段
  const last = p.split('/').pop() ?? p;
  if (CATEGORY_LABELS[last]) return CATEGORY_LABELS[last];
  return last;
}

/** raw/wiki 直系子目录（二级路径），用于分类导航 */
export function isTopCategory(relPath: string): boolean {
  const p = normPath(relPath);
  return p === 'raw' || p === 'wiki';
}

/** raw/wiki 的直系子目录（如 raw/originals、wiki/entities） */
export function isSubCategory(relPath: string): boolean {
  const p = normPath(relPath);
  return (
    p === 'raw/originals' ||
    p === 'raw/fulltext' ||
    p === 'raw/inbox' ||
    p === 'wiki/entities' ||
    p === 'wiki/topics' ||
    p === 'wiki/sources'
  );
}

/** 文件名中间截断：超过阈值时保留头尾各7位，中间用省略号 */
export function truncateMiddle(name: string, threshold = 16): string {
  if (name.length <= threshold) return name;
  return name.slice(0, 7) + '...' + name.slice(-7);
}
