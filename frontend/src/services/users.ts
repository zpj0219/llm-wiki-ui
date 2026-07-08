import { getAuthHeaders, notifyAuthExpired, AuthExpiredError } from './authSession';
import { API_BASE } from './api';
import type { UserPermissions } from '@shared/types';

export interface User {
  id: number;
  username: string;
  email?: string;
  full_name?: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
  permissions?: UserPermissions;
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
    const res = await requestJson<ApiResult<User> & { permissions?: UserPermissions }>(`${API_BASE}/api/auth/me`);
    if (res.success && res.data) {
      const user = res.data;
      if (res.permissions) {
        user.permissions = res.permissions;
        // 缓存权限到 localStorage
        localStorage.setItem('userPermissions', JSON.stringify(res.permissions));
      }
      return user;
    }
    return getSessionUser();
  } catch (e) {
    if (e instanceof AuthExpiredError) throw e;
    return getSessionUser();
  }
}

// ── 用户管理 API（仅管理员） ──────────────────────────────────────

export async function fetchUsers(): Promise<User[]> {
  const res = await requestJson<{ success: boolean; users: User[] }>(
    `${API_BASE}/api/auth/users`
  );
  return res.users ?? [];
}

export async function createUserApi(data: {
  username: string;
  password: string;
  email?: string;
  full_name?: string;
  is_active?: boolean;
}): Promise<User> {
  const res = await requestJson<{ success: boolean; user: User }>(
    `${API_BASE}/api/auth/users`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
  return res.user;
}

export async function updateUserApi(
  userId: number,
  data: {
    username?: string;
    password?: string;
    email?: string;
    full_name?: string;
    is_active?: boolean;
  }
): Promise<User> {
  const res = await requestJson<{ success: boolean; user: User }>(
    `${API_BASE}/api/auth/users/${userId}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    }
  );
  return res.user;
}

export async function deleteUserApi(userId: number): Promise<void> {
  await requestJson<{ success: boolean }>(
    `${API_BASE}/api/auth/users/${userId}`,
    { method: 'DELETE' }
  );
}

export async function fetchUserPermissions(userId: number): Promise<UserPermissions> {
  const res = await requestJson<{ success: boolean; permissions: UserPermissions }>(
    `${API_BASE}/api/auth/users/${userId}/permissions`
  );
  return res.permissions;
}

export async function updateUserPermissionsApi(
  userId: number,
  permissions: UserPermissions
): Promise<UserPermissions> {
  const res = await requestJson<{ success: boolean; permissions: UserPermissions }>(
    `${API_BASE}/api/auth/users/${userId}/permissions`,
    {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    }
  );
  return res.permissions;
}
