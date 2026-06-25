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

export async function listWikiEntries(): Promise<{
  success: boolean;
  files: WikiFileEntry[];
  root?: string;
  error?: string;
}> {
  try {
    const res = await requestJson<ApiResult<{ files: WikiFileEntry[]; root: string }>>(
      '/api/wiki/entries'
    );
    return { success: true, files: res.files, root: res.root };
  } catch (e) {
    return { success: false, files: [], error: e instanceof Error ? e.message : String(e) };
  }
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
