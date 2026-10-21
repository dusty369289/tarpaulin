import { useEffect, type ReactNode } from 'react';
import { useSettings } from '../app/settingsStore';
import { useActivePage } from '../dashboard/store';
import { hexToTriple, readableOn } from '../lib/color';
import { getBackground } from './backgrounds';
import { usePageLook } from './look';
import { useResolvedTheme } from './mode';
import { FONTS, modeOf, THEMES } from './themes';

/**
 * Writes the theme tokens to CSS variables on <html>; every component reads those. A textured
 * background (of the page being shown) brings its own chrome colours for the current mode,
 * except in high contrast. `data-theme`, `data-mode` and `data-background` on <html> let CSS
 * pick each texture's light or dark variant.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const resolved = useResolvedTheme();
  const mode = modeOf(resolved);
  const { accent, font, radius, fontScale } = useSettings();
  const page = useActivePage();
  const background = getBackground(usePageLook(page).background);
  const textured = Boolean(background.tokens) && resolved !== 'high-contrast';

  useEffect(() => {
    const root = document.documentElement;
    const tokens = { ...(textured ? background.tokens![mode] : THEMES[resolved]) };
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
    root.dataset.mode = mode;
    root.dataset.background = textured ? background.id : 'plain';
    root.style.colorScheme = mode;
  }, [resolved, mode, accent, font, radius, fontScale, background, textured]);

  return <>{children}</>;
}
