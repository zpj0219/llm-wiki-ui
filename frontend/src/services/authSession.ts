/** 登录态与 token 读写 */

export const AUTH_EXPIRED_EVENT = 'ems:auth:expired';

const TOKEN_KEYS = ['token', 'accessToken', 'access_token', 'authToken'] as const;

export class AuthExpiredError extends Error {
  constructor(message = '登录已失效，请重新登录') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

export function getStoredAccessToken(): string | null {
  for (const key of TOKEN_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw?.trim()) return raw.trim();
  }
  return null;
}

export function persistAccessToken(token: string): void {
  const t = token.trim();
  if (!t) return;
  localStorage.setItem('token', t);
  localStorage.setItem('accessToken', t);
}

export function clearAuthSession(): void {
  const keys = [
    'isLoggedIn',
    'isAuthenticated',
    'token',
    'accessToken',
    'access_token',
    'authToken',
    'username',
    'userId',
    'userEmail',
    'isSuperUser',
    'fullName',
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
