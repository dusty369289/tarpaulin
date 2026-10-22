import type { LucideIcon } from 'lucide-react';
import { CATEGORY_META, SETTINGS_CATEGORIES, type SettingsCategory } from '../app/settingsNav';

// Settings in Quick find.
//
// Each entry becomes an action in the palette's Actions group that calls
// `onOpenSettings(entry.section)` (a prop of <QuickFind>, given by App.tsx), which opens Settings
// on that category. There's one per category, made from the category's own title, description,
// keywords and icon (src/app/settingsNav.ts).

export interface SettingsEntry {
  /** Stable id, kept in recent picks. */
  id: string;
  title: string;
  /** Which category to open; undefined opens Settings where it was last left. */
  section?: SettingsCategory;
  keywords?: string[];
  detail?: string;
  icon?: LucideIcon;
}

export const SETTINGS_ENTRIES: SettingsEntry[] = [
  {
    id: 'settings',
    title: 'Open Settings',
    keywords: ['preferences', 'options'],
    detail: 'Look, courses, notifications and your Canvas account',
  },
  ...SETTINGS_CATEGORIES.map((id): SettingsEntry => {
    const c = CATEGORY_META[id];
    return {
      id: `settings:${id}`,
      title: `Settings › ${c.title}`,
      section: id,
      keywords: c.keywords,
      detail: c.description.replace(/\.$/, ''),
      icon: c.icon,
    };
  }),
];
