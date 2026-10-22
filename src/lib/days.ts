import { format, isValid, parse, parseISO } from 'date-fns';
import { z } from 'zod';

// Calendar days and times of day as the app stores them: `yyyy-MM-dd` keys and `HH:mm` strings,
// on the wall clock times are shown in. Kept apart from dates.ts, which reads the settings, so
// the settings schema itself can use these (dates.ts re-exports them for everyone else).

/** `yyyy-MM-dd`. */
export const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** `HH:mm`, 00:00 to 23:59. */
export const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** yyyy-MM-dd of a local date. */
export const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

/** A stored day key that names a real date. */
export const DayKeySchema = z
  .string()
  .regex(DAY_KEY_RE)
  .refine((s) => isValid(parseISO(s)));
export const TimeOfDaySchema = z.string().regex(TIME_OF_DAY_RE);

/** Minutes since midnight of an `HH:mm`. */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** The day `day` (yyyy-MM-dd) at `hhmm`, local. */
export const atTime = (day: string, hhmm: string): Date =>
  parse(`${day} ${hhmm}`, 'yyyy-MM-dd HH:mm', new Date());
