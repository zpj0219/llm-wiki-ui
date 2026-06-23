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

export function titleFromPath(relPath: string): string {
  const base = relPath.split('/').pop() ?? relPath;
  return base.replace(/\.md$/i, '');
}
