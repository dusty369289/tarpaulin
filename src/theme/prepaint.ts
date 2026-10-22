import { BACKGROUNDS } from './backgrounds/data';
import { THEMES, type ByMode, type ThemeName, type ThemeTokens } from './themes';

/**
 * The colours the pre-paint script in index.html needs to paint the window in the user's theme
 * before the app's JavaScript has loaded: every theme, and every textured background's chrome
 * per mode. The build writes this object over the placeholder in index.html.
 */
export interface PrepaintData {
  themes: Record<ThemeName, ThemeTokens>;
  backgrounds: Record<string, ByMode<ThemeTokens>>;
}

export const PREPAINT_PLACEHOLDER = '__TARPAULIN_PREPAINT__';

export function prepaintData(): PrepaintData {
  const backgrounds: PrepaintData['backgrounds'] = {};
  for (const b of BACKGROUNDS) if (b.tokens) backgrounds[b.id] = b.tokens;
  return { themes: THEMES, backgrounds };
}
