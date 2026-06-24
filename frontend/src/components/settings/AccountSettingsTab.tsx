import { User, Mail, Shield, LogOut } from 'lucide-react';
import { UserAvatar } from '@/components/layout/UserAvatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  getStoredUserEmail,
  getStoredUsername,
  isStoredSuperUser,
} from '@/services/authSession';

type AccountSettingsTabProps = {
  onLogout?: () => void;
};

export function AccountSettingsTab({ onLogout }: AccountSettingsTabProps) {
  const username = getStoredUsername() || '—';
  const email = getStoredUserEmail() || '—';
  const isAdmin = isStoredSuperUser();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">当前账户</CardTitle>
          <CardDescription>登录会话信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <UserAvatar
              username={username}
              isAdmin={isAdmin}
              className="size-14"
              fallbackClassName="text-lg"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{username}</span>
                {isAdmin && (
                  <Badge variant="secondary" className="text-[10px]">
                    <Shield className="h-3 w-3 mr-0.5" />
                    管理员
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{email}</p>
            </div>
          </div>

          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              <span>用户名</span>
              <span className="ml-auto font-medium text-foreground">{username}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>邮箱</span>
              <span className="ml-auto font-medium text-foreground">{email}</span>
            </div>
          </div>

          <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={onLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            退出登录
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
