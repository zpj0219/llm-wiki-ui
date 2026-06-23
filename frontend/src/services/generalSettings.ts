export type GeneralSettings = {
  theme: 'light' | 'dark' | 'system';
  language: string;
  showNotifications: boolean;
};

const STORAGE_KEY = 'generalSettings';

const DEFAULTS: GeneralSettings = {
  theme: 'light',
  language: 'zh-CN',
  showNotifications: true,
};

export function getGeneralSettings(): GeneralSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveGeneralSettings(settings: GeneralSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function applyTheme(theme: GeneralSettings['theme']): void {
  const root = document.documentElement;
  if (theme === 'system') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', dark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
  window.dispatchEvent(new CustomEvent('app:theme-change'));
}

export function initTheme(): void {
  applyTheme(getGeneralSettings().theme);
}
