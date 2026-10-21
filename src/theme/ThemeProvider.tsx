import { useEffect, useState, type ReactNode } from 'react';
import { useSettings } from '../app/settingsStore';
import { useActivePage } from '../dashboard/store';
import { hexToTriple, readableOn } from '../lib/color';
import { getBackground } from './backgrounds';
import { usePageLook } from './look';
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

/**
 * Writes the theme tokens to CSS variables on <html>; every component reads those. A textured
 * background (of the page being shown) brings its own chrome colours, except in high contrast.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const resolved = useResolvedTheme();
  const { accent, font, radius, fontScale } = useSettings();
  const page = useActivePage();
  const background = getBackground(usePageLook(page).background);
  const textured = Boolean(background.tokens) && resolved !== 'high-contrast';

  useEffect(() => {
    const root = document.documentElement;
    const tokens = { ...(textured ? background.tokens! : THEMES[resolved]) };
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
    root.dataset.background = textured ? background.id : 'plain';
    const dark = textured ? background.dark : resolved !== 'light';
    root.style.colorScheme = dark ? 'dark' : 'light';
  }, [resolved, accent, font, radius, fontScale, background, textured]);

  return <>{children}</>;
}
