import { useState } from 'react';
import { Palette, Globe, BookOpen, User } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { SETTINGS_TABS, type SettingsTab } from '@shared/constants';
import { GeneralSettingsTab } from '@/components/settings/GeneralSettingsTab';
import { ApiSettingsTab } from '@/components/settings/ApiSettingsTab';
import { LlmWikiSettingsTab } from '@/components/settings/LlmWikiSettingsTab';
import { AccountSettingsTab } from '@/components/settings/AccountSettingsTab';

const TAB_ICONS: Record<SettingsTab, typeof Palette> = {
  general: Palette,
  api: Globe,
  'llm-wiki': BookOpen,
  account: User,
};

type SettingsPageProps = {
  onLogout?: () => void;
};

export function SettingsPage({ onLogout }: SettingsPageProps) {
  const [tab, setTab] = useState<SettingsTab>('general');

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="px-4 py-4">
        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
          <nav className="flex md:flex-col gap-1 md:w-40 shrink-0 overflow-x-auto pb-1 md:pb-0" style={{ touchAction: 'auto' }}>
            {SETTINGS_TABS.map((t) => {
              const Icon = TAB_ICONS[t.id];
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

          <div className="flex-1 min-w-0">
            {tab === 'general' && <GeneralSettingsTab />}
            {tab === 'api' && <ApiSettingsTab />}
            {tab === 'llm-wiki' && <LlmWikiSettingsTab />}
            {tab === 'account' && <AccountSettingsTab onLogout={onLogout} />}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
