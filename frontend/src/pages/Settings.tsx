import { useState } from 'react';
import { Palette, BookOpen, HelpCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { type SettingsTab } from '@shared/constants';
import { GeneralSettingsTab } from '@/components/settings/GeneralSettingsTab';
import { LlmWikiSettingsTab } from '@/components/settings/LlmWikiSettingsTab';
import { HelpTab } from '@/components/settings/HelpTab';
import { getStoredPermissions } from '@/services/authSession';

const TABS: { id: SettingsTab; label: string; icon: typeof Palette; permissionKey?: string }[] = [
  { id: 'general', label: '通用', icon: Palette },
  { id: 'llm-wiki', label: 'LLM-Wiki', icon: BookOpen, permissionKey: 'can_access_settings' },
  { id: 'help', label: '帮助', icon: HelpCircle },
];

export function SettingsPage({ onLogout }: { onLogout?: () => void }) {
  const [tab, setTab] = useState<SettingsTab>('general');
  const permissions = getStoredPermissions();
  const isAdmin = localStorage.getItem('isSuperUser') === 'true';

  const visibleTabs = TABS.filter((t) => {
    if (!t.permissionKey) return true;
    if (isAdmin) return true;
    if (!permissions) return true;
    return (permissions as Record<string, boolean>)[t.permissionKey] !== false;
  });

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6 h-full px-4 py-4">
      <nav className="flex md:flex-col gap-1 md:w-40 shrink-0 overflow-x-auto pb-1 md:pb-0" style={{ touchAction: 'auto' }}>
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors',
                tab === t.id
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 min-w-0 min-h-0">
        <ScrollArea className="h-full">
          {tab === 'general' && <GeneralSettingsTab onLogout={onLogout} />}
          {tab === 'llm-wiki' && <LlmWikiSettingsTab />}
          {tab === 'help' && <HelpTab />}
        </ScrollArea>
      </div>
    </div>
  );
}
