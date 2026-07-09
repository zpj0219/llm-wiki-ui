import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, User, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API_BASE } from '@/services/api';
import { persistTokens, broadcastAuthStateChange } from '@/services/authSession';

type LoginFormProps = React.ComponentPropsWithoutRef<'div'> & {
  onLoginSuccess?: () => void;
};

export function LoginForm({ className, onLoginSuccess, ...props }: LoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const savedUsername = localStorage.getItem('savedUsername');
    const savedPassword = localStorage.getItem('savedPassword');
    if (savedUsername) setUsername(savedUsername);
    if (savedPassword) setPassword(savedPassword);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const safeUsername = username.trim();

    if (!safeUsername) {
      setError('请输入用户名');
      return;
    }
    if (!password) {
      setError('请输入密码');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const loginEndpoint = `${API_BASE}/api/auth/login`;
      let response: Response;
      try {
        response = await fetch(loginEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: safeUsername, password }),
        });
      } catch (fetchError: unknown) {
        const msg = fetchError instanceof Error ? fetchError.message : '无法连接到服务器';
        throw new Error(`无法连接到服务器 (${loginEndpoint})\n${msg}`);
      }

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok || responseData.success === false) {
        throw new Error(
          responseData.errorMessage ??
            responseData.message ??
            `登录失败: ${response.statusText} (${response.status})`
        );
      }

      const data = responseData.data ?? responseData;
      if (!data) throw new Error('登录响应数据格式错误');

      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('isAuthenticated', String(responseData.success ?? true));

      const token =
        data.access_token ?? data.token ?? data.accessToken ?? responseData.access_token;
      if (!token || typeof token !== 'string') {
        throw new Error('登录成功但未返回 token');
      }
      const refreshToken =
        data.refresh_token ?? responseData.refresh_token ?? responseData.data?.refresh_token ?? '';
      persistTokens(token, refreshToken);

      const user = data.user ?? {};
      localStorage.setItem('username', user.username ?? data.username ?? safeUsername);
      if (user.id) localStorage.setItem('userId', String(user.id));
      if (user.email) localStorage.setItem('userEmail', user.email);
      if (user.is_superuser !== undefined) {
        localStorage.setItem('isSuperUser', String(Boolean(user.is_superuser)));
      }
      if (user.full_name) localStorage.setItem('fullName', user.full_name);

      localStorage.setItem('savedUsername', safeUsername);
      localStorage.setItem('savedPassword', password);

      // 保存权限
      const permissions = responseData.permissions ?? data.permissions;
      if (permissions) {
        localStorage.setItem('userPermissions', JSON.stringify(permissions));
      }

      // 通知其他窗口同步登录状态
      broadcastAuthStateChange();

      onLoginSuccess?.();
    } catch (err: unknown) {
      let message = err instanceof Error ? err.message : '登录失败，请重试';
      if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        message = '无法连接到服务器，请确认后端已启动（默认 http://localhost:8000）';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card className="shadow-md">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-xl">欢迎回来</CardTitle>
          <CardDescription className="text-center">登录以访问知识库</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleLogin(e)}>
            <div className="grid gap-5">
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="flex-1 whitespace-pre-line">{error}</div>
                </div>
              )}

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="username">用户名</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="username"
                      type="text"
                      placeholder="admin"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={loading}
                      autoComplete="username"
                      className="pl-9"
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">密码</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      autoComplete="current-password"
                      className="pl-9"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full mt-1" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      登录中...
                    </>
                  ) : (
                    '登录'
                  )}
                </Button>
              </div>

            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
