import { getAuthHeaders } from './authSession';
import { API_BASE } from './api';
import { invalidateWikiEntriesCache, listWikiEntries } from './wikiApi';

export type OriginalsDirEntry = {
  relPath: string;
  name: string;
};

export type UploadConfig = {
  inboxPath: string;
  originalsBase: string;
  defaultTargetDir: string;
  knowledgeBaseRoot: string;
  pipelineNote: string;
};

const ORIGINALS_PREFIX = 'raw/originals';
const DEFAULT_TARGET = `${ORIGINALS_PREFIX}/maintenance/manuals`;

function normPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '').replace(/\/$/, '') || p;
}

/** 与工作台文件树同源：从 /api/wiki/entries 提取 raw/originals 目录 */
export function originalsDirsFromWikiEntries(
  files: { relPath: string; isDirectory: boolean }[]
): OriginalsDirEntry[] {
  return files
    .filter((f) => f.isDirectory && normPath(f.relPath).startsWith(ORIGINALS_PREFIX))
    .map((f) => {
      const relPath = normPath(f.relPath);
      return {
        relPath,
        name:
          relPath === ORIGINALS_PREFIX
            ? 'originals'
            : (relPath.split('/').pop() ?? relPath),
      };
    })
    .sort((a, b) => a.relPath.localeCompare(b.relPath, 'zh-CN'));
}

export async function listOriginalsDirs(): Promise<{
  success: boolean;
  directories: OriginalsDirEntry[];
  base?: string;
  error?: string;
}> {
  const res = await listWikiEntries();
  if (!res.success) {
    return { success: false, directories: [], error: res.error ?? '加载目录失败' };
  }
  const directories = originalsDirsFromWikiEntries(res.files);
  return {
    success: true,
    base: ORIGINALS_PREFIX,
    directories,
  };
}

export async function getUploadConfig(): Promise<{
  success: boolean;
  config?: UploadConfig;
  error?: string;
}> {
  const res = await listWikiEntries();
  if (!res.success) {
    return { success: false, error: res.error };
  }
  return {
    success: true,
    config: {
      inboxPath: 'raw/inbox',
      originalsBase: ORIGINALS_PREFIX,
      defaultTargetDir: DEFAULT_TARGET,
      knowledgeBaseRoot: res.root ?? '',
      pipelineNote: '上传后由 LLM-Wiki 定时任务：originals → fulltext → wiki ingest → qmd 索引',
    },
  };
}

export type UploadResult = {
  success: boolean;
  relPath?: string;
  message?: string;
  error?: string;
  reason?: 'duplicate';
  existingPath?: string;
};

export async function uploadOriginal(
  file: File,
  options: { targetDir: string; toInbox?: boolean }
): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('target_dir', options.targetDir);
  form.append('to_inbox', options.toInbox ? 'true' : 'false');

  try {
    const headers = getAuthHeaders();
    delete (headers as Record<string, string>)['Content-Type'];

    const res = await fetch(`${API_BASE}/api/upload/originals`, {
      method: 'POST',
      headers,
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail ?? data.message ?? `HTTP ${res.status}`);
    }
    if (data.success === false && data.reason === 'duplicate') {
      return { success: false, reason: 'duplicate', message: data.message, existingPath: data.existingPath };
    }
    invalidateWikiEntriesCache();
    return {
      success: true,
      relPath: data.relPath,
      message: data.message,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type UploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

/** 带进度回调的上传，使用 XMLHttpRequest 以获取 upload.progress 事件 */
export function uploadOriginalWithProgress(
  file: File,
  options: { targetDir: string; toInbox?: boolean },
  onProgress?: (progress: UploadProgress) => void,
): Promise<UploadResult> {
  return new Promise((resolve) => {
    const form = new FormData();
    form.append('file', file);
    form.append('target_dir', options.targetDir);
    form.append('to_inbox', options.toInbox ? 'true' : 'false');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/upload/originals`);

    const authHeaders = getAuthHeaders();
    for (const [key, value] of Object.entries(authHeaders)) {
      if (key.toLowerCase() !== 'content-type') {
        xhr.setRequestHeader(key, value as string);
      }
    }

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress({
          loaded: e.loaded,
          total: e.total,
          percent: Math.round((e.loaded / e.total) * 100),
        });
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) {
          if (data.success === false && data.reason === 'duplicate') {
            resolve({ success: false, reason: 'duplicate', message: data.message, existingPath: data.existingPath });
          } else {
            invalidateWikiEntriesCache();
            resolve({
              success: true,
              relPath: data.relPath,
              message: data.message,
            });
          }
        } else {
          resolve({
            success: false,
            error: data.detail ?? data.message ?? `HTTP ${xhr.status}`,
          });
        }
      } catch {
        resolve({ success: false, error: `HTTP ${xhr.status}` });
      }
    });

    xhr.addEventListener('error', () => {
      resolve({ success: false, error: '网络错误，上传失败' });
    });

    xhr.addEventListener('abort', () => {
      resolve({ success: false, error: '上传已取消' });
    });

    xhr.send(form);
  });
}
