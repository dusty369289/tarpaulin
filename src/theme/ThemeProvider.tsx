import { useEffect, useState, type ReactNode } from 'react';
import { useSettings } from '../app/settingsStore';
import { hexToTriple, readableOn } from '../lib/color';
import { FONTS, THEMES, type ThemeName } from './themes';

function useSystemDark() {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return dark;
}

export function useResolvedTheme(): ThemeName {
  const theme = useSettings((s) => s.theme);
  const systemDark = useSystemDark();
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}

/** Writes the theme tokens to CSS variables on <html>; every component reads those. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const resolved = useResolvedTheme();
  const { accent, font, radius, fontScale } = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    const tokens = { ...THEMES[resolved] };
    const custom = accent && hexToTriple(accent);
    // High contrast keeps its own accent: a custom colour could break the contrast guarantee.
    if (custom && resolved !== 'high-contrast') {
      tokens.accent = custom;
      tokens['accent-fg'] = readableOn(accent);
    }
    for (const [k, v] of Object.entries(tokens)) root.style.setProperty(`--${k}`, v);
    root.style.setProperty('--font', FONTS[font]);
    root.style.setProperty('--radius', `${radius}px`);
    root.style.fontSize = `${16 * fontScale}px`;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved === 'light' ? 'light' : 'dark';
  }, [resolved, accent, font, radius, fontScale]);

  return <>{children}</>;
}
