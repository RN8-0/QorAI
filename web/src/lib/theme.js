import { useEffect, useState } from 'react';

const KEY = 'qorai-theme';

export function getTheme() {
  return 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState(getTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch { /* noop */ }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  return { theme, toggle, set: setTheme };
}
