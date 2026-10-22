// Settings in Quick find.
//
// Each entry becomes an action in the palette's Actions group that calls
// `onOpenSettings(entry.section)` (a prop of <QuickFind>, given by App.tsx), which opens Settings
// on that category. A test checks there's one entry for every category.

export interface SettingsEntry {
  /** Stable id, kept in recent picks. */
  id: string;
  title: string;
  /** Which part of Settings to open; undefined opens Settings at the top. */
  section?: string;
  keywords?: string[];
  detail?: string;
}

export const SETTINGS_ENTRIES: SettingsEntry[] = [
  {
    id: 'settings',
    title: 'Open Settings',
    keywords: ['preferences', 'options'],
    detail: 'Look, courses, notifications and your Canvas account',
  },
  // One per Settings category (src/app/settingsNav.ts), opening straight on it.
  {
    id: 'settings:appearance',
    title: 'Settings › Appearance',
    section: 'appearance',
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
    detail: 'The look, light or dark mode, colours and text',
  },
  {
    id: 'settings:courses',
    title: 'Settings › Courses',
    section: 'courses',
    keywords: ['hide', 'nickname', 'colour', 'color', 'term'],
    detail: 'Which courses show, with their colours and nicknames',
  },
  {
    id: 'settings:calendar',
    title: 'Settings › Calendar & time',
    section: 'calendar',
    keywords: ['week starts', 'clock', '24-hour', 'time zone', 'timezone'],
    detail: 'The first day of the week, the clock and the time zone',
  },
  {
    id: 'settings:notifications',
    title: 'Settings › Notifications',
    section: 'notifications',
    keywords: ['reminders', 'alerts', 'quiet hours', 'deadline'],
    detail: 'Deadline reminders, announcements, grades and quiet hours',
  },
  {
    id: 'settings:reading',
    title: 'Settings › Reading',
    section: 'reading',
    keywords: ['reader', 'open in canvas', 'images'],
    detail: 'Where assignments and announcements open',
  },
  {
    id: 'settings:startup',
    title: 'Settings › Startup & tray',
    section: 'startup',
    keywords: ['login', 'autostart', 'tray', 'background', 'minimised', 'minimized'],
    detail: 'Opening at login and running in the tray',
  },
  {
    id: 'settings:account',
    title: 'Settings › Account',
    section: 'account',
    keywords: ['token', 'canvas', 'disconnect', 'sign in', 'login'],
    detail: 'Your Canvas connection and access token',
  },
  {
    id: 'settings:data',
    title: 'Settings › Data & backup',
    section: 'data',
    keywords: ['export', 'import', 'backup', 'reset', 'refresh', 'cache'],
    detail: 'Refreshing, export and import, and resets',
  },
  {
    id: 'settings:about',
    title: 'Settings › About',
    section: 'about',
    keywords: ['version', 'update', 'license', 'source'],
    detail: 'The version, updates and the source code',
  },
];
