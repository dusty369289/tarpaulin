// Settings in Quick find.
//
// THE PLACE TO ADD SETTINGS ENTRIES. Each entry becomes an action in the palette's Actions group
// that calls `onOpenSettings(entry.section)` (a prop of <QuickFind>, given by App.tsx). Today
// there is one, "Open Settings", and App.tsx ignores the section: it just shows Settings.
//
// When Settings gains categories with deep links, add one entry per category here, e.g.
//   { id: 'settings:notifications', title: 'Settings › Notifications',
//     section: 'notifications', keywords: ['reminders', 'alerts'] },
// and have App.tsx's `onOpenSettings(section)` route to that category.

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
    keywords: ['preferences', 'options', 'look', 'theme', 'notifications', 'account', 'courses'],
    detail: 'Look, courses, notifications and your Canvas account',
  },
];
