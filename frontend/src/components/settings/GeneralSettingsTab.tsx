import { useState } from 'react';
import { Moon, Sun, Monitor, Bell } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  applyTheme,
  getGeneralSettings,
  saveGeneralSettings,
  type GeneralSettings,
} from '@/services/generalSettings';
import { cn } from '@/lib/utils';

export function GeneralSettingsTab() {
  const [settings, setSettings] = useState<GeneralSettings>(() => getGeneralSettings());

  const update = (patch: Partial<GeneralSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveGeneralSettings(next);
    if (patch.theme !== undefined) applyTheme(next.theme);
  };

  const themeOptions: {
    value: GeneralSettings['theme'];
    label: string;
    icon: typeof Sun;
  }[] = [
    { value: 'light', label: '浅色', icon: Sun },
    { value: 'dark', label: '深色', icon: Moon },
    { value: 'system', label: '跟随系统', icon: Monitor },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">外观</CardTitle>
          <CardDescription>选择界面主题</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {themeOptions.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                type="button"
                variant={settings.theme === value ? 'default' : 'outline'}
                className={cn('h-auto flex-col gap-1.5 py-3', settings.theme !== value && 'bg-muted/30')}
                onClick={() => update({ theme: value })}
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs">{label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">通知</CardTitle>
          <CardDescription>控制应用内提示行为</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="flex items-start gap-3">
              <Bell className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <Label>显示操作通知</Label>
                <p className="text-xs text-muted-foreground mt-0.5">保存、刷新等操作完成后提示</p>
              </div>
            </div>
            <Switch
              checked={settings.showNotifications}
              onCheckedChange={(checked) => update({ showNotifications: checked })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
