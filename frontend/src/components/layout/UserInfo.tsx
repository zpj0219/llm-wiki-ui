import { useState, useEffect } from 'react';
import { UserAvatar } from '@/components/layout/UserAvatar';
import {
  getStoredUserEmail,
  getStoredUsername,
  isStoredSuperUser,
} from '@/services/authSession';

export function UserInfo() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setUsername(getStoredUsername() || 'User');
    setEmail(getStoredUserEmail() || '');
    setIsAdmin(isStoredSuperUser());
  }, []);

  return (
    <div className="border-t border-border p-3">
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
    </div>
  );
}
