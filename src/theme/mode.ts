import { useSyncExternalStore } from 'react';
import { useSettings } from '../app/settingsStore';
import { modeOf, type Mode, type ThemeName } from './themes';

// One shared prefers-color-scheme listener, however many widgets ask.
const QUERY = '(prefers-color-scheme: dark)';
function subscribeSystem(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
const systemDark = () => window.matchMedia(QUERY).matches;

/** The theme in effect: the setting, with 'system' resolved through prefers-color-scheme. */
export function useResolvedTheme(): ThemeName {
  const theme = useSettings((s) => s.theme);
  const dark = useSyncExternalStore(subscribeSystem, systemDark, () => false);
  return theme === 'system' ? (dark ? 'dark' : 'light') : theme;
}

/** The light/dark variant of every look in effect. High contrast uses the dark variants. */
export function useMode(): Mode {
  return modeOf(useResolvedTheme());
}
