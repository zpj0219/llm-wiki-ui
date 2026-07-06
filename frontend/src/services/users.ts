import { getAuthHeaders, notifyAuthExpired, AuthExpiredError } from './authSession';
import { API_BASE } from './api';

export interface User {
  id: number;
  username: string;
  email?: string;
  full_name?: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
}

type ApiResult<T> = { success: boolean; data?: T; errorMessage?: string; message?: string };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
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
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { detail?: string; message?: string; errorMessage?: string }).detail ??
        (err as { message?: string }).message ??
        (err as { errorMessage?: string }).errorMessage ??
        `HTTP ${response.status}`
    );
  }

  return response.json() as Promise<T>;
}

export function getSessionUser(): User | null {
  const username = localStorage.getItem('username');
  const userId = localStorage.getItem('userId');
  if (!username || !userId) return null;
  return {
    id: Number(userId),
    username,
    email: localStorage.getItem('userEmail') ?? undefined,
    full_name: localStorage.getItem('fullName') ?? undefined,
    is_active: true,
    is_superuser: localStorage.getItem('isSuperUser') === 'true',
    created_at: '',
  };
}

export async function fetchCurrentUser(): Promise<User | null> {
  try {
    const res = await requestJson<ApiResult<User>>(`${API_BASE}/auth/me`);
    if (res.success && res.data) return res.data;
    return getSessionUser();
  } catch (e) {
    if (e instanceof AuthExpiredError) throw e;
    return getSessionUser();
  }
}
