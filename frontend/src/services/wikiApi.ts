import { requestJson } from './api';
import type {
  OriginalsFileStatus,
  WikiFileEntry,
  WikiGraphEdge,
  WikiGraphNode,
  WikiSearchResult,
  WikiStats,
} from '@shared/types';

type ApiResult<T> = { success: boolean } & T;

/** 进程级 entries 缓存：避免多面板/弹窗并发或 effect 抖动重复打 /api/wiki/entries */
let wikiEntriesCache: {
  success: boolean;
  files: WikiFileEntry[];
  root?: string;
  error?: string;
} | null = null;
let wikiEntriesPromise: Promise<{
  success: boolean;
  files: WikiFileEntry[];
  root?: string;
  error?: string;
}> | null = null;

export function invalidateWikiEntriesCache(): void {
  wikiEntriesCache = null;
  wikiEntriesPromise = null;
}

export async function listWikiEntries(options?: {
  /** 跳过缓存强制刷新（上传/删除/索引刷新后） */
  force?: boolean;
}): Promise<{
  success: boolean;
  files: WikiFileEntry[];
  root?: string;
  error?: string;
}> {
  if (!options?.force) {
    if (wikiEntriesCache) return wikiEntriesCache;
    if (wikiEntriesPromise) return wikiEntriesPromise;
  } else {
    wikiEntriesCache = null;
    wikiEntriesPromise = null;
  }

  wikiEntriesPromise = (async () => {
    try {
      const res = await requestJson<ApiResult<{ files: WikiFileEntry[]; root: string }>>(
        '/api/wiki/entries'
      );
      const payload = { success: true as const, files: res.files, root: res.root };
      wikiEntriesCache = payload;
      return payload;
    } catch (e) {
      // 失败不缓存，允许下次重试
      wikiEntriesCache = null;
      return {
        success: false as const,
        files: [] as WikiFileEntry[],
        error: e instanceof Error ? e.message : String(e),
      };
    } finally {
      wikiEntriesPromise = null;
    }
  })();

  return wikiEntriesPromise;
}

export async function readWikiPage(relPath: string): Promise<{
  success: boolean;
  content?: string;
  error?: string;
}> {
  try {
    const res = await requestJson<ApiResult<{ content: string }>>(
      `/api/wiki/pages/${encodeURIComponent(relPath)}`
    );
    return { success: true, content: res.content };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function writeWikiPage(
  relPath: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requestJson(`/api/wiki/pages/${encodeURIComponent(relPath)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
    invalidateWikiEntriesCache();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getWikiBacklinks(relPath: string): Promise<string[]> {
  const res = await requestJson<ApiResult<{ backlinks: string[] }>>(
    `/api/wiki/backlinks/${encodeURIComponent(relPath)}`
  );
  return res.backlinks;
}

export async function searchWiki(
  query: string,
  limit = 20
): Promise<WikiSearchResult[]> {
  const res = await requestJson<ApiResult<{ results: WikiSearchResult[] }>>(
    '/api/wiki/search',
    { method: 'POST', body: JSON.stringify({ query, limit }) }
  );
  return res.results;
}

export async function getWikiGraph(): Promise<{
  nodes: WikiGraphNode[];
  edges: WikiGraphEdge[];
}> {
  const res = await requestJson<
    ApiResult<{ nodes: WikiGraphNode[]; edges: WikiGraphEdge[] }>
  >('/api/wiki/graph');
  return { nodes: res.nodes, edges: res.edges };
}

export async function getWikiStats(): Promise<WikiStats> {
  const res = await requestJson<ApiResult<{ stats: WikiStats }>>('/api/wiki/stats');
  return res.stats;
}

export async function refreshWikiIndex(): Promise<void> {
  await requestJson('/api/wiki/refresh', { method: 'POST' });
  invalidateWikiEntriesCache();
}

export async function getOriginalsStatus(): Promise<{
  success: boolean;
  statuses?: Record<string, OriginalsFileStatus>;
  error?: string;
}> {
  try {
    const res = await requestJson<
      ApiResult<{ statuses: Record<string, OriginalsFileStatus> }>
    >('/api/wiki/originals-status');
    return { success: true, statuses: res.statuses };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function ensureDir(dirPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requestJson('/api/wiki/ensure-dir', {
      method: 'POST',
      body: JSON.stringify({ dir_path: dirPath }),
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteWikiEntry(relPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requestJson(`/api/wiki/pages/${encodeURIComponent(relPath)}`, {
      method: 'DELETE',
    });
    invalidateWikiEntriesCache();
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function getDownloadUrl(relPath: string): string {
  return `${import.meta.env.VITE_API_BASE ?? ''}/api/wiki/download/${encodeURIComponent(relPath)}`;
}

export async function downloadWikiFile(relPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { getAuthHeaders } = await import('./authSession');
    const url = getDownloadUrl(relPath);
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as any).detail ?? `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const fileName = relPath.split('/').pop() ?? 'download';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
