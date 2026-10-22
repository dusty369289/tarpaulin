// Which category the Settings page shows. Kept apart from the (lazily loaded) page so anything
// can link to a category without pulling the page in.

export const SETTINGS_CATEGORIES = [
  'appearance',
  'courses',
  'calendar',
  'notifications',
  'reading',
  'startup',
  'account',
  'data',
  'about',
] as const;

export type SettingsCategory = (typeof SETTINGS_CATEGORIES)[number];

export const isSettingsCategory = (v: unknown): v is SettingsCategory =>
  SETTINGS_CATEGORIES.includes(v as SettingsCategory);

const KEY = 'tarpaulin.settingsCategory';

/** The hash that opens Settings, on `category` if given: `#/settings?category=account`. */
export const settingsHash = (category?: SettingsCategory) =>
  category ? `/settings?category=${category}` : '/settings';

/** Opens Settings, on `category` if given (otherwise the last one shown this session). */
export function openSettings(category?: SettingsCategory) {
  location.hash = settingsHash(category);
}

/** The category a deep link in the current hash asks for, if any. */
export function categoryFromHash(): SettingsCategory | null {
  const query = location.hash.split('?')[1];
  const asked = query ? new URLSearchParams(query).get('category') : null;
  return isSettingsCategory(asked) ? asked : null;
}

/** The category last shown this session (sessionStorage), or the first. */
export function lastCategory(): SettingsCategory {
  try {
    const saved = sessionStorage.getItem(KEY);
    if (isSettingsCategory(saved)) return saved;
  } catch {
    // Storage blocked: start at the top.
  }
  return SETTINGS_CATEGORIES[0];
}

export function rememberCategory(category: SettingsCategory) {
  try {
    sessionStorage.setItem(KEY, category);
  } catch {
    // Storage blocked: Settings just opens on the first category next time.
  }
}
