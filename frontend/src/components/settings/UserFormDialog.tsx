import { useState, useEffect } from 'react';
import { Loader2, User, Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { User as UserType } from '@/services/users';

type UserFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: UserFormData) => Promise<void>;
  user?: UserType | null;
};

export type UserFormData = {
  username: string;
  password: string;
  email: string;
  full_name: string;
  is_active: boolean;
};

export function UserFormDialog({ open, onOpenChange, onSave, user }: UserFormDialogProps) {
  const isEdit = !!user;
  const isAdminUser = user?.is_superuser ?? false;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setUsername(user?.username ?? '');
      setPassword('');
      setEmail(user?.email ?? '');
      setFullName(user?.full_name ?? '');
      setIsActive(user?.is_active ?? true);
      setError('');
    }
  }, [open, user]);

  const handleSave = async () => {
    setError('');

    const trimmedUser = username.trim();
    if (!trimmedUser) {
      setError('请输入用户名');
      return;
    }
    if (!isEdit && !password) {
      setError('请输入密码');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        username: trimmedUser,
        password: password || '',
        email: email.trim() || '',
        full_name: fullName.trim() || '',
        is_active: isActive,
      });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑用户' : '添加用户'}</DialogTitle>
          <DialogDescription>
            {isEdit ? `修改 ${user?.username} 的信息` : '创建一个新的系统用户'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="uf-username">用户名</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="uf-username"
                  type="text"
                  placeholder="输入用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={saving}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="uf-password">
                {isEdit ? '新密码（留空则不修改）' : '密码'}
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="uf-password"
                  type="password"
                  placeholder={isEdit ? '留空保持原密码' : '输入密码'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={saving}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="uf-email">邮箱</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="uf-email"
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={saving}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="uf-fullname">全名</Label>
              <Input
                id="uf-fullname"
                type="text"
                placeholder="用户全名"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={saving}
              />
            </div>

            {!isAdminUser && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <Label>账号状态</Label>
                    <span className="text-xs text-muted-foreground">
                      {isActive ? '启用 — 用户可以正常登录' : '禁用 — 用户无法登录，提示联系管理员'}
                    </span>
                  </div>
                  <Switch
                    id="uf-active"
                    checked={isActive}
                    onCheckedChange={setIsActive}
                    disabled={saving}
                  />
                </div>
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              '保存'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
