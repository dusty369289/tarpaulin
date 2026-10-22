import type { ComponentType } from 'react';
import {
  CATEGORY_META,
  SETTINGS_CATEGORIES,
  type CategoryMeta,
  type SettingsCategory,
} from '../settingsNav';
import { AboutSettings } from './About';
import { AccountSettings } from './Account';
import { AppearanceSettings } from './Appearance';
import { CalendarSettings } from './CalendarTime';
import { CoursesSettings } from './Courses';
import { DataSettings } from './DataBackup';
import { NotificationsSettings } from './Notifications';
import { ReadingSettings } from './Reading';
import { StartupSettings } from './Startup';

// What each Settings category holds, one file each. Every category is a list of `Section` cards
// of `Row`s, so search can show the matching rows of all of them at once (see SettingsPage).
// Titles, descriptions and icons are in settingsNav.ts, shared with Quick find.

export interface CategoryInfo extends CategoryMeta {
  id: SettingsCategory;
  Content: ComponentType;
}

const CONTENT: Record<SettingsCategory, ComponentType> = {
  appearance: AppearanceSettings,
  courses: CoursesSettings,
  calendar: CalendarSettings,
  notifications: NotificationsSettings,
  reading: ReadingSettings,
  startup: StartupSettings,
  account: AccountSettings,
  data: DataSettings,
  about: AboutSettings,
};

/** The categories, in sidebar order. */
export const CATEGORIES: CategoryInfo[] = SETTINGS_CATEGORIES.map((id) => ({
  id,
  ...CATEGORY_META[id],
  Content: CONTENT[id],
}));
