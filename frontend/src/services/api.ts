import {
  AuthExpiredError,
  getAuthHeaders,
  notifyAuthExpired,
} from './authSession';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...init?.headers,
    },
  });

  if (response.status === 401) {
    notifyAuthExpired({ source: url });
    throw new AuthExpiredError();
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(err.detail ?? err.message ?? err.errorMessage ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export { requestJson, API_BASE };
