/** 登录态与 token 读写 — 支持 access_token + refresh_token 机制 */

export const AUTH_EXPIRED_EVENT = 'ems:auth:expired';
export const AUTH_STATE_CHANGED = 'ems:auth:state-changed';
export const RELOGIN_ERROR_CODE = 'TOKEN_EXPIRED_OR_REVOKED';

let refreshPromise: Promise<string | null> | null = null;

export class AuthExpiredError extends Error {
  constructor(message = '登录已失效，请重新登录') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

export function getStoredAccessToken(): string | null {
  return localStorage.getItem('accessToken')?.trim() || null;
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem('refreshToken')?.trim() || null;
}

export function persistTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem('accessToken', accessToken.trim());
  localStorage.setItem('refreshToken', refreshToken.trim());
  // 兼容旧代码
  localStorage.setItem('token', accessToken.trim());
}

export function clearAuthSession(): void {
  const keys = [
    'isLoggedIn', 'isAuthenticated',
    'token', 'accessToken', 'access_token', 'authToken', 'refreshToken',
    'username', 'userId', 'userEmail', 'isSuperUser', 'fullName',
    'userPermissions', 'savedUsername', 'savedPassword',
  ];
  for (const key of keys) {
    localStorage.removeItem(key);
  }
}

export function notifyAuthExpired(detail?: { message?: string; source?: string }): void {
  clearAuthSession();
  window.dispatchEvent(
    new CustomEvent(AUTH_EXPIRED_EVENT, {
      detail: detail ?? { message: '登录已失效，请重新登录' },
    })
  );
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getStoredAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * 尝试用 refresh_token 换取新的 access_token。
 * 返回新的 access_token，失败返回 null。
 */
export async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  // 防止并发刷新
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const resp = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${refreshToken}` },
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const newAccess = data?.data?.access_token;
      if (newAccess) {
        localStorage.setItem('accessToken', newAccess);
        localStorage.setItem('token', newAccess);
      }
      return newAccess || null;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export function isLoggedInLocally(): boolean {
  return localStorage.getItem('isLoggedIn') === 'true' && !!getStoredAccessToken();
}

export function getStoredUsername(): string {
  return localStorage.getItem('username') ?? localStorage.getItem('savedUsername') ?? '';
}

export function getStoredUserEmail(): string {
  return localStorage.getItem('userEmail') ?? '';
}

export function isStoredSuperUser(): boolean {
  return localStorage.getItem('isSuperUser') === 'true';
}

export function getStoredPermissions(): Record<string, boolean> | null {
  try {
    const raw = localStorage.getItem('userPermissions');
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return null;
  }
}

export function setStoredPermissions(permissions: Record<string, boolean>): void {
  localStorage.setItem('userPermissions', JSON.stringify(permissions));
}

/**
 * 广播登录状态变更，使其他同源窗口同步。
 * 调用时机：登录成功 / 退出登录 / token 刷新。
 */
export function broadcastAuthStateChange(): void {
  window.dispatchEvent(new CustomEvent(AUTH_STATE_CHANGED));
}
