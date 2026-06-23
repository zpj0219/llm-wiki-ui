import { useEffect, useState } from 'react';
import { getGraphThemeColors, type GraphThemeColors } from './obsidianGraphTheme';

export function useGraphTheme(): GraphThemeColors {
  const [theme, setTheme] = useState(() => getGraphThemeColors());

  useEffect(() => {
    const refresh = () => setTheme(getGraphThemeColors());

    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('app:theme-change', refresh);

    return () => {
      observer.disconnect();
      mq.removeEventListener('change', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('app:theme-change', refresh);
    };
  }, []);

  return theme;
}
