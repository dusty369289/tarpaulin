import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { z } from 'zod';
import { NotificationPrefsSchema } from '../notifications/prefs';
import type { FontName, ThemeChoice } from '../theme/themes';

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
  weekStartsOn: z.enum(['monday', 'sunday']).default('monday'),
  autoCheckUpdates: z.boolean().default(true),
  notifications: NotificationPrefsSchema,
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

interface SettingsState extends Settings {
  update: (patch: Partial<Settings>) => void;
  setCourseColor: (courseId: string, color: string | null) => void;
  setCourseNickname: (courseId: string, nickname: string | null) => void;
  toggleCourseHidden: (courseId: string) => void;
  reset: () => void;
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
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'tarpaulin.settings',
      version: 2,
      // v1 defaulted to the current term only, which hid whole terms when Canvas's term dates
      // were misleading. Almost nobody changed it, so 'current' moves to the new default.
      migrate: (persisted, version) => {
        const state = { ...(persisted as Record<string, unknown>) };
        if (version < 2 && state.courseScope === 'current') state.courseScope = 'all';
        return state as unknown as SettingsState;
      },
      merge: (persisted, current) => {
        const parsed = SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(persisted as object) });
        return { ...current, ...(parsed.success ? parsed.data : {}) };
      },
    },
  ),
);

export function pickSettings(s: Settings): Settings {
  return SettingsSchema.parse(s);
}

export type { FontName, ThemeChoice };
