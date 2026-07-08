import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { PERMISSION_FIELDS, PERMISSION_LABELS, type UserPermissions } from '@shared/types';

type UserPermissionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (permissions: UserPermissions) => Promise<void>;
  username: string;
  permissions: UserPermissions;
};

export function UserPermissionsDialog({
  open,
  onOpenChange,
  onSave,
  username,
  permissions,
}: UserPermissionsDialogProps) {
  const [perms, setPerms] = useState<UserPermissions>({ ...permissions });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setPerms({ ...permissions });
      setError('');
    }
  }, [open, permissions]);

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      await onSave(perms);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const regularPerms = PERMISSION_FIELDS.filter((f) => f !== 'can_manage_accounts');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>权限管理</DialogTitle>
          <DialogDescription>
            设置 <span className="font-medium text-foreground">{username}</span> 的功能访问权限
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                功能模块权限
              </Label>
              <div className="space-y-0.5 rounded-lg border bg-muted/30">
                {regularPerms.map((field) => (
                  <div
                    key={field}
                    className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/50 transition-colors first:rounded-t-lg last:rounded-b-lg"
                  >
                    <span className="text-sm">{PERMISSION_LABELS[field]}</span>
                    <Switch
                      checked={perms[field]}
                      onCheckedChange={(v) =>
                        setPerms((prev) => ({ ...prev, [field]: v }))
                      }
                      disabled={saving}
                    />
                  </div>
                ))}
              </div>
            </div>
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
