import { BookOpen, MessageSquare, Settings, CircleUser } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserInfo } from '@/components/layout/UserInfo';
import { PAGES, PAGE_LABELS, KARPATHY_WIKI_TAGLINE, APP_VERSION, type PageId, hasAnyWikiAccess } from '@shared/constants';
import type { UserPermissions } from '@shared/types';
import { useState, useEffect } from 'react';
import { API_BASE } from '@/services/api';

type SidebarProps = {
  currentPage: PageId;
  onPageChange: (page: PageId) => void;
  permissions?: UserPermissions | null;
  onLogout?: () => void;
};

const ALL_NAV_ITEMS: { id: PageId; icon: typeof BookOpen; permissionKey?: keyof UserPermissions; adminOnly?: boolean; alwaysShow?: boolean; wikiGate?: boolean }[] = [
  { id: PAGES.CHAT, icon: MessageSquare, permissionKey: 'can_access_chat' },
  { id: PAGES.LLM_WIKI, icon: BookOpen, wikiGate: true },
  { id: PAGES.ACCOUNT_MANAGEMENT, icon: CircleUser, adminOnly: true },
  { id: PAGES.SETTINGS, icon: Settings, alwaysShow: true },
];

export function Sidebar({ currentPage, onPageChange, permissions, onLogout }: SidebarProps) {
  const isAdmin = localStorage.getItem('isSuperUser') === 'true';
  const canManageAccounts = permissions?.can_manage_accounts || isAdmin;
  const [userMgmtMode, setUserMgmtMode] = useState<string | null>(null);

  // 获取用户管理模式（Odoo 模式下仅管理员可见用户管理入口）
  useEffect(() => {
    fetch(`${API_BASE}/api/auth/config`)
      .then((r) => r.json().catch(() => ({})))
      .then((d) => setUserMgmtMode((d as any)?.userManagementMode ?? 'local'))
      .catch(() => setUserMgmtMode('local'));
  }, []);

  // Filter nav items by permissions AND mode
  const navItems = ALL_NAV_ITEMS.filter((item) => {
    if (item.alwaysShow) return true;
    // 用户管理入口
    if (item.adminOnly) {
      // 管理员在所有模式下都可见
      if (isAdmin) return true;
      // 加载期间：非管理员保守不显示
      if (userMgmtMode === null) return false;
      // odoo 模式：非管理员不显示
      if (userMgmtMode === 'odoo') return false;
      // local 模式：按权限字段判断
      return canManageAccounts;
    }
    if (item.wikiGate) return hasAnyWikiAccess(permissions ?? null, isAdmin);
    if (!item.permissionKey) return true;
    if (isAdmin) return true;
    if (!permissions) return true;
    return permissions[item.permissionKey] !== false;
  });
  return (
    <div
      data-sidebar
      className="flex h-full flex-col border-r border-border bg-background"
      style={{
        width: 'var(--sidebar-width)',
        minWidth: 'var(--sidebar-width)',
        maxWidth: 'var(--sidebar-width)',
      }}
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <BookOpen className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight">LLM-Wiki</span>
          <span className="block truncate text-[10px] text-muted-foreground">{KARPATHY_WIKI_TAGLINE}</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          导航
        </p>
        {navItems.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
              currentPage === id
                ? 'bg-accent font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
            onClick={() => onPageChange(id)}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{PAGE_LABELS[id]}</span>
          </button>
        ))}
      </nav>

      <UserInfo onLogout={onLogout} />
      <div className="px-3 pb-3 -mt-1">
        <p className="px-2 text-xs font-semibold text-muted-foreground tabular-nums" title="前端版本">
          版本 v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}
