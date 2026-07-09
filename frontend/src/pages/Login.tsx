import { useEffect, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { LoginForm } from '@/components/login-form';
import { KARPATHY_WIKI_TAGLINE } from '@shared/constants';
import { API_BASE } from '@/services/api';
import { persistTokens, broadcastAuthStateChange } from '@/services/authSession';

interface LoginPageProps {
  onLoginSuccess?: () => void;
}

/** 处理 Odoo SSO 回调：URL 带 ?odoo_token=... 时自动调用后端验证并登录 */
function useOdooCallback(onSuccess: () => void) {
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('odoo_token');
    if (!token) return;

    called.current = true;
    void (async () => {
      try {
        const resp = await fetch(
          `${API_BASE}/api/auth/odoo/callback?token=${encodeURIComponent(token)}`,
        );
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.success === false) {
          const msg = data.detail ?? data.errorMessage ?? `认证失败 (HTTP ${resp.status})`;
          throw new Error(msg);
        }

        const payload = data.data ?? data;
        const accessToken = payload.access_token;
        if (!accessToken) throw new Error('未返回 token');

        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('isAuthenticated', 'true');
        persistTokens(accessToken, payload.refresh_token ?? '');

        const user = payload.user ?? {};
        localStorage.setItem('username', user.username ?? '');
        if (user.id) localStorage.setItem('userId', String(user.id));
        if (user.email) localStorage.setItem('userEmail', user.email);
        if (user.is_superuser !== undefined) {
          localStorage.setItem('isSuperUser', String(Boolean(user.is_superuser)));
        }
        if (user.full_name) localStorage.setItem('fullName', user.full_name);

        const permissions = payload.permissions;
        if (permissions) {
          localStorage.setItem('userPermissions', JSON.stringify(permissions));
        }

        // 清理 URL 中的 odoo_token，防止刷新页面后重复处理
        window.history.replaceState({}, '', window.location.pathname);

        broadcastAuthStateChange();
        onSuccess();
      } catch (e) {
        setCallbackError(e instanceof Error ? e.message : 'Odoo SSO 登录失败');
      }
    })();
  }, [onSuccess]);

  return callbackError;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const odooError = useOdooCallback(onLoginSuccess ?? (() => {}));
  const [userMgmtMode, setUserMgmtMode] = useState<string>('local');

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/config`)
      .then((r) => r.json().catch(() => ({})))
      .then((d) => setUserMgmtMode((d as any)?.userManagementMode ?? 'local'))
      .catch(() => {});
  }, []);

  return (
    <div className="login-bg flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <BookOpen className="size-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">LLM-Wiki</h1>
            <p className="text-sm text-muted-foreground">{KARPATHY_WIKI_TAGLINE}</p>
          </div>
        </div>

        {odooError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive text-center">
            {odooError}
          </div>
        )}

        {userMgmtMode === 'odoo' && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-700 dark:text-blue-300 text-center leading-relaxed">
            当前为 Odoo SSO 模式，请通过 Odoo 菜单访问。<br />管理员可使用本地账号登录后台管理。
          </div>
        )}

        <LoginForm onLoginSuccess={onLoginSuccess} />
      </div>
    </div>
  );
}
