import { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  Pencil,
  Trash2,
  CircleUser,
  Loader2,
  AlertCircle,
  Settings2,
  Mail,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserFormDialog, type UserFormData } from '@/components/settings/UserFormDialog';
import { UserPermissionsDialog } from '@/components/settings/UserPermissionsDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  fetchUsers,
  createUserApi,
  updateUserApi,
  deleteUserApi,
  updateUserPermissionsApi,
  type User as UserType,
} from '@/services/users';
import type { UserPermissions } from '@shared/types';
import { cn } from '@/lib/utils';

function useIsMobile() {
  const [v, setV] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  useEffect(() => {
    const m = window.matchMedia('(max-width: 767px)');
    const h = (e: MediaQueryListEvent) => setV(e.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return v;
}

export function AccountManagementTab() {
  const isMobile = useIsMobile();
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isOdooMode, setIsOdooMode] = useState(false);

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [permOpen, setPermOpen] = useState(false);
  const [permUser, setPermUser] = useState<UserType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserType | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 获取用户管理模式
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE ?? ''}/api/auth/config`)
      .then((r) => r.json().catch(() => ({})))
      .then((d) => setIsOdooMode(((d as any)?.userManagementMode ?? 'local') === 'odoo'))
      .catch(() => {});
  }, []);

  const loadUsers = useCallback(async () => {
    setError('');
    try {
      const list = await fetchUsers();
      setUsers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleToggleActive = async (u: UserType) => {
    if (u.is_superuser) return;
    setError('');
    try {
      await updateUserApi(u.id, { is_active: !u.is_active });
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleCreate = async (data: UserFormData) => {
    await createUserApi({
      username: data.username,
      password: data.password,
      email: data.email || undefined,
      full_name: data.full_name || undefined,
      is_active: data.is_active,
    });
    await loadUsers();
  };

  const handleUpdate = async (data: UserFormData) => {
    if (!editingUser) return;
    await updateUserApi(editingUser.id, {
      username: data.username,
      password: data.password || undefined,
      email: data.email || undefined,
      full_name: data.full_name || undefined,
      is_active: data.is_active,
    });
    await loadUsers();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteUserApi(deleteTarget.id);
      setDeleteTarget(null);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const handlePermissionsSave = async (permissions: UserPermissions) => {
    if (!permUser) return;
    await updateUserPermissionsApi(permUser.id, permissions);
    await loadUsers();
  };

  const openEdit = (user: UserType) => {
    setEditingUser(user);
    setFormOpen(true);
  };

  const openCreate = () => {
    setEditingUser(null);
    setFormOpen(true);
  };

  const openPerms = (user: UserType) => {
    setPermUser(user);
    setPermOpen(true);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base">用户管理</CardTitle>
              <CardDescription>
                {isOdooMode
                  ? 'Odoo SSO 模式 — 查看用户列表（用户由 Odoo 统一管理）'
                  : '管理系统用户账号和功能访问权限'}
              </CardDescription>
            </div>
            {!isOdooMode && (
              <Button size="sm" onClick={openCreate}>
                <UserPlus className="h-4 w-4 mr-1.5" />
                添加用户
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              加载中...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              暂无用户
            </div>
          ) : isMobile ? (
            /* 移动端：卡片列表 */
            <div className="space-y-3">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="rounded-lg border bg-card p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {u.username}
                          </span>
                          {u.is_superuser ? (
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              <CircleUser className="h-3 w-3 mr-0.5" />
                              管理员
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              <CircleUser className="h-3 w-3 mr-0.5" />
                              普通
                            </Badge>
                          )}
                          {!u.is_active && (
                            <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30 shrink-0">
                              已禁用
                            </Badge>
                          )}
                        </div>
                        {u.full_name && (
                          <p className="text-xs text-muted-foreground mt-0.5">{u.full_name}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {u.email && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      {u.email}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 pt-1">
                    {isOdooMode ? (
                      <span className="text-[10px] text-muted-foreground/50 px-1">由 Odoo 管理</span>
                    ) : (
                      <>
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8"
                        onClick={() => openEdit(u)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        编辑
                      </Button>
                    {!u.is_superuser && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8"
                        onClick={() => openPerms(u)}
                      >
                        <Settings2 className="h-3.5 w-3.5 mr-1" />
                        权限
                      </Button>
                    )}
                    {!u.is_superuser && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(u)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* 桌面端：表格 */
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                    <th className="py-2.5 pr-3 font-medium">用户</th>
                    <th className="py-2.5 pr-3 font-medium hidden md:table-cell">邮箱</th>
                    <th className="py-2.5 pr-3 font-medium">角色</th>
                    <th className="py-2.5 pr-3 font-medium">状态</th>
                    <th className="py-2.5 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="font-medium truncate block">{u.username}</span>
                            {u.full_name && (
                              <span className="text-xs text-muted-foreground truncate block">
                                {u.full_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground hidden md:table-cell">
                        {u.email || '—'}
                      </td>
                      <td className="py-2.5 pr-3">
                        {u.is_superuser ? (
                          <Badge variant="secondary" className="text-[10px]">
                            <CircleUser className="h-3 w-3 mr-0.5" />
                            管理员
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            <CircleUser className="h-3 w-3 mr-0.5" />
                            普通用户
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        {u.is_superuser ? (
                          <span className="text-xs font-medium text-green-600">启用</span>
                        ) : isOdooMode ? (
                          <span className="text-[10px] text-muted-foreground/50">由 Odoo 管理</span>
                        ) : (
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              className={cn(
                                'text-xs font-medium transition-colors',
                                u.is_active
                                  ? 'text-green-600'
                                  : 'text-muted-foreground hover:text-green-600'
                              )}
                              onClick={() => { if (!u.is_active) handleToggleActive(u); }}
                            >
                              启用
                            </button>
                            <button
                              type="button"
                              className={cn(
                                'text-xs font-medium transition-colors',
                                !u.is_active
                                  ? 'text-destructive'
                                  : 'text-muted-foreground hover:text-destructive'
                              )}
                              onClick={() => { if (u.is_active) handleToggleActive(u); }}
                            >
                              禁用
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isOdooMode ? (
                            <span className="text-[10px] text-muted-foreground/50 px-2">
                              由 Odoo 管理
                            </span>
                          ) : (
                            <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="编辑"
                            onClick={() => openEdit(u)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {!u.is_superuser && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="权限管理"
                              onClick={() => openPerms(u)}
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {!u.is_superuser && !isOdooMode && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              title="删除"
                              onClick={() => setDeleteTarget(u)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 添加/编辑 Dialog */}
      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={editingUser ? handleUpdate : handleCreate}
        user={editingUser}
      />

      {/* 权限管理 Dialog */}
      {permUser && (
        <UserPermissionsDialog
          open={permOpen}
          onOpenChange={setPermOpen}
          onSave={handlePermissionsSave}
          username={permUser.username}
          permissions={permUser.permissions ?? {
            can_access_wiki_workbench: true,
            can_access_wiki_rawfiles: true,
            can_access_wiki_graph: true,
            can_access_wiki_search: true,
            can_access_chat: true,
            can_access_settings: true,
            can_manage_accounts: false,
          }}
        />
      )}

      {/* 删除确认 Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent onClose={() => setDeleteTarget(null)}>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除用户 <span className="font-medium text-foreground">{deleteTarget?.username}</span> 吗？
              此操作不可撤销，该用户的对话记录也会被删除。
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  删除中...
                </>
              ) : (
                '确认删除'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
