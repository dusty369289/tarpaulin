import { z } from 'zod';

/** Reminder lead times, in minutes before a deadline. */
export const LEAD_OPTIONS = [
  { minutes: 7 * 24 * 60, label: '1 week' },
  { minutes: 3 * 24 * 60, label: '3 days' },
  { minutes: 24 * 60, label: '1 day' },
  { minutes: 3 * 60, label: '3 hours' },
  { minutes: 60, label: '1 hour' },
  { minutes: 15, label: '15 minutes' },
] as const;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const prefs = z.object({
  enabled: z.boolean().default(true),
  deadlines: z.boolean().default(true),
  leads: z
    .array(
      z
        .number()
        .int()
        .min(1)
        .max(30 * 24 * 60),
    )
    .max(LEAD_OPTIONS.length)
    .default([24 * 60, 60]),
  announcements: z.boolean().default(true),
  grades: z.boolean().default(true),
  /** "Planned for today": on the do-date of work in My plan (src/planner). */
  planned: z.boolean().default(true),
  /** A preview of the week ahead, the evening before it starts (rules/weekly.ts). */
  weekly: z.boolean().default(true),
  quietHours: z
    .object({
      enabled: z.boolean().default(false),
      start: time.default('22:00'),
      end: time.default('08:00'),
    })
    .default({}),
});
export type NotificationPrefs = z.infer<typeof prefs>;
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = prefs.parse({});

/** Bad stored values fall back to the defaults instead of invalidating every other setting. */
export const NotificationPrefsSchema = prefs.default({}).catch(DEFAULT_NOTIFICATION_PREFS);
