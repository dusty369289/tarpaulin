import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { z } from 'zod';
import { NotificationPrefsSchema } from '../notifications/prefs';
import type { FontName, ThemeChoice } from '../theme/themes';
import { parseWithDefaults } from '../widgets/settings/fields';

export const SettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark', 'high-contrast']).default('system'),
  /** Empty means "use the theme's accent". */
  accent: z.string().default(''),
  /** Default page background and widget style (see src/theme). Pages and widgets can override. */
  background: z.string().default('plain'),
  widgetStyle: z.string().default('card'),
  font: z.enum(['system', 'rounded', 'serif', 'mono', 'readable']).default('system'),
  radius: z.number().min(0).max(24).default(12),
  fontScale: z.number().min(0.85).max(1.3).default(1),
  refreshMinutes: z.number().min(1).max(120).default(10),
  /** Every course by default; hide individual ones, or narrow to the current term. */
  courseScope: z.enum(['current', 'all']).default('all'),
  hiddenCourseIds: z.array(z.string()).default([]),
  courseColors: z.record(z.string()).default({}),
  courseNicknames: z.record(z.string()).default({}),
  clock: z.enum(['auto', '12h', '24h']).default('auto'),
  /** Due times, "Today" and the clock in the computer's time zone, or in the one set in Canvas. */
  timesIn: z.enum(['device', 'canvas']).default('device'),
  weekStartsOn: z.enum(['monday', 'sunday']).default('monday'),
  autoCheckUpdates: z.boolean().default(true),
  /** Clicking an assignment, announcement or event: read it in Tarpaulin, or open Canvas. */
  openItemsIn: z.enum(['app', 'canvas']).default('app'),
  /** Images in Canvas content hosted on other sites: load them, or wait for a click. */
  loadRemoteImages: z.boolean().default(true),
  notifications: NotificationPrefsSchema,
  /** A preview of the week ahead, the evening before it starts (src/notifications/weekly.ts). */
  weeklyPreview: z.boolean().default(true),
  /** "Planned for today": a reminder on the do-date of work in My plan (src/planner). New keys
   *  with a default load without a version bump (parseSettings goes field by field). */
  planReminders: z.boolean().default(true),
  /** When the OS opens Tarpaulin at login, start minimised. (Opening at login itself is an OS
   *  setting, read and written through the desktop bridge.) */
  startMinimized: z.boolean().default(true),
  /** Closing the window keeps Tarpaulin running in the tray, so reminders keep arriving. */
  closeToTray: z.boolean().default(true),
  /** The dashboard's top bar: translucent frosted glass, or a quiet solid strip. */
  barStyle: z.enum(['frosted', 'basic']).default('frosted'),
  /** Slide the top bar away until the pointer nears the top edge (never on touch screens). */
  barFoldAway: z.boolean().default(false),
  /** Set once the first-launch "Make it yours" step is done or skipped. */
  onboarded: z.boolean().default(false),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

/** Field by field: a value that no longer fits (a removed font, a tightened range) falls back to
 *  its default without taking the other settings with it. Unknown keys are dropped. */
export function parseSettings(raw: unknown): Settings {
  return parseWithDefaults(SettingsSchema, raw);
}

/** What "Reset look and courses" puts back. How items open, refresh, notifications, startup,
 *  updates and first-run setup are left alone. */
export const APPEARANCE_KEYS = [
  'theme',
  'accent',
  'background',
  'widgetStyle',
  'font',
  'radius',
  'fontScale',
  'barStyle',
  'barFoldAway',
  'clock',
  'timesIn',
  'weekStartsOn',
  'courseScope',
  'hiddenCourseIds',
  'courseColors',
  'courseNicknames',
] as const satisfies readonly (keyof Settings)[];

interface SettingsState extends Settings {
  update: (patch: Partial<Settings>) => void;
  setCourseColor: (courseId: string, color: string | null) => void;
  setCourseNickname: (courseId: string, nickname: string | null) => void;
  toggleCourseHidden: (courseId: string) => void;
  /** Look, appearance and course preferences back to their defaults (see APPEARANCE_KEYS). */
  resetAppearance: () => void;
}

export const SETTINGS_VERSION = 3;

/** Brings an older saved shape up to date. The result still goes through parseSettings. */
export function migrateSettings(persisted: unknown, version: number): Record<string, unknown> {
  const state =
    persisted && typeof persisted === 'object' ? { ...(persisted as Record<string, unknown>) } : {};
  // v1 defaulted to the current term only, which hid whole terms when Canvas's term dates
  // were misleading. Almost nobody changed it, so 'current' moves to the new default.
  if (version < 2 && state.courseScope === 'current') state.courseScope = 'all';
  // v3 added loadRemoteImages and timesIn. Both start where the app already was: images load,
  // times follow the computer.
  if (version < 3) {
    state.loadRemoteImages ??= true;
    state.timesIn ??= 'device';
  }
  return state;
}

function withEntry(map: Record<string, string>, key: string, value: string | null) {
  const next = { ...map };
  if (value) next[key] = value;
  else delete next[key];
  return next;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      setCourseColor: (id, color) =>
        set((s) => ({ courseColors: withEntry(s.courseColors, id, color) })),
      setCourseNickname: (id, nickname) =>
        set((s) => ({
          courseNicknames: withEntry(s.courseNicknames, id, nickname?.trim() || null),
        })),
      toggleCourseHidden: (id) =>
        set((s) => ({
          hiddenCourseIds: s.hiddenCourseIds.includes(id)
            ? s.hiddenCourseIds.filter((x) => x !== id)
            : [...s.hiddenCourseIds, id],
        })),
      resetAppearance: () =>
        set(Object.fromEntries(APPEARANCE_KEYS.map((k) => [k, DEFAULT_SETTINGS[k]]))),
    }),
    {
      name: 'tarpaulin.settings',
      version: SETTINGS_VERSION,
      migrate: (persisted, version) =>
        migrateSettings(persisted, version) as unknown as SettingsState,
      merge: (persisted, current) => ({ ...current, ...parseSettings(persisted) }),
    },
  ),
);

/** Just the settings, without the store's actions (for export). */
export function pickSettings(s: Settings): Settings {
  return parseSettings(s);
}

export type { FontName, ThemeChoice };
