import {
  getAuthHeaders,
  tryRefreshToken,
  notifyAuthExpired,
  broadcastAuthStateChange,
  AuthExpiredError,
} from './authSession';
import { getApiBase } from '../shared/utils/apiConfig';

let base = '';

/** Initialize the API_BASE once from apiConfig. Call on app start. */
export function initApiBase(): void {
  base = getApiBase().replace(/\/$/, '');
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const fullUrl = url.startsWith('http') ? url : `${base}${url}`;

  let response = await fetch(fullUrl, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...init?.headers,
    },
  });

  // 401 → 尝试 refresh
  if (response.status === 401) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      broadcastAuthStateChange();
      // 用新 token 重试一次
      response = await fetch(fullUrl, {
        ...init,
        headers: {
          ...getAuthHeaders(),
          ...init?.headers,
        },
      });
    }

    // 仍然 401 → 触发重登
    if (response.status === 401) {
      notifyAuthExpired({ source: url });
      throw new AuthExpiredError();
    }
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err.detail ?? err.message ?? err.errorMessage ?? `HTTP ${response.status}`
    );
  }
  return response.json() as Promise<T>;
}

export { requestJson, base as API_BASE };
