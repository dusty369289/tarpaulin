import {
  Bell,
  BookOpen,
  CalendarClock,
  Database,
  GraduationCap,
  Info,
  MonitorCog,
  Palette,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

// The Settings categories and which one the page shows. Kept apart from the (lazily loaded) page
// so anything can link to a category, or list them (Quick find), without pulling the page in.

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

export interface CategoryMeta {
  title: string;
  /** One line under the title on the page, and under the entry in Quick find. */
  description: string;
  /** Other words Quick find should find the category by. */
  keywords: string[];
  icon: LucideIcon;
}

/** What each category is called and holds. The sidebar order is SETTINGS_CATEGORIES'. */
export const CATEGORY_META: Record<SettingsCategory, CategoryMeta> = {
  appearance: {
    title: 'Appearance',
    description: 'The look, light or dark mode, colours and text.',
    keywords: [
      'look',
      'theme',
      'dark',
      'light',
      'colour',
      'color',
      'accent',
      'font',
      'text size',
      'background',
      'style',
    ],
    icon: Palette,
  },
  courses: {
    title: 'Courses',
    description: 'Which courses show, with their colours and nicknames.',
    keywords: ['hide', 'nickname', 'colour', 'color', 'term'],
    icon: GraduationCap,
  },
  calendar: {
    title: 'Calendar & time',
    description: 'The first day of the week, the clock and the time zone.',
    keywords: ['week starts', 'clock', '24-hour', 'time zone', 'timezone'],
    icon: CalendarClock,
  },
  notifications: {
    title: 'Notifications',
    description: 'Deadline reminders, announcements, grades and quiet hours.',
    keywords: ['reminders', 'alerts', 'quiet hours', 'deadline'],
    icon: Bell,
  },
  reading: {
    title: 'Reading',
    description: 'Where assignments and announcements open, and outside images.',
    keywords: ['reader', 'open in canvas', 'images'],
    icon: BookOpen,
  },
  startup: {
    title: 'Startup & tray',
    description: 'Opening at login and running in the tray.',
    keywords: ['login', 'autostart', 'tray', 'background', 'minimised', 'minimized'],
    icon: MonitorCog,
  },
  account: {
    title: 'Account',
    description: 'Your Canvas connection and access token.',
    keywords: ['token', 'canvas', 'disconnect', 'sign in', 'login'],
    icon: UserRound,
  },
  data: {
    title: 'Data & backup',
    description: 'Refreshing, the cache, export and import, and resets.',
    keywords: ['export', 'import', 'backup', 'reset', 'refresh', 'cache'],
    icon: Database,
  },
  about: {
    title: 'About',
    description: 'The version, updates, and where Tarpaulin comes from.',
    keywords: ['version', 'update', 'license', 'source'],
    icon: Info,
  },
};

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
