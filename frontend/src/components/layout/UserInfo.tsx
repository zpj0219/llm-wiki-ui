import { useState, useEffect, useRef } from 'react';
import { Shield, LogOut } from 'lucide-react';
import { UserAvatar } from '@/components/layout/UserAvatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  getStoredUserEmail,
  getStoredUsername,
  isStoredSuperUser,
  clearAuthSession,
} from '@/services/authSession';
import { cn } from '@/lib/utils';

type UserInfoProps = {
  onLogout?: () => void;
};

export function UserInfo({ onLogout }: UserInfoProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUsername(getStoredUsername() || 'User');
    setEmail(getStoredUserEmail() || '');
    setIsAdmin(isStoredSuperUser());
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [panelOpen]);

  const handleLogout = () => {
    setPanelOpen(false);
    clearAuthSession();
    onLogout?.();
  };

  return (
    <div ref={rootRef} className="relative border-t border-border p-3">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        className="w-full text-left hover:bg-muted/30 transition-colors cursor-pointer rounded-lg"
      >
        <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-2.5 py-2">
          <UserAvatar username={username} isAdmin={isAdmin} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate leading-tight">{username}</p>
            {email ? (
              <p className="text-[10px] text-muted-foreground truncate">{email}</p>
            ) : (
              <p className="text-[10px] text-muted-foreground">{isAdmin ? '管理员' : '普通用户'}</p>
            )}
          </div>
        </div>
      </button>

      {/* Popover */}
      {panelOpen && (
        <div
          className={cn(
            'absolute left-3 right-3 bottom-full mb-2 z-50',
            'rounded-xl border border-border bg-popover shadow-lg',
            'animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2',
            'duration-200'
          )}
        >
          {/* Arrow */}
          <div className="absolute -bottom-1.5 left-6 h-3 w-3 rotate-45 border-r border-b border-border bg-popover" />

          <div className="p-4 space-y-3">
            {/* User info */}
            <div className="flex items-center gap-3">
              <UserAvatar
                username={username}
                isAdmin={isAdmin}
                className="size-11"
                fallbackClassName="text-sm"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm">{username}</span>
                  {isAdmin && (
                    <Badge variant="secondary" className="text-[9px] py-0 px-1.5">
                      <Shield className="h-2.5 w-2.5 mr-0.5" />
                      管理员
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {email || '未设置邮箱'}
                </p>
              </div>
            </div>

            {/* Logout button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="h-3.5 w-3.5 mr-1.5" />
              退出登录
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
