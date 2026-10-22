import type { NotificationPrefs } from './prefs';

// What every notification rule (rules/*.ts) shares: the note they produce, the summary that
// replaces a burst of them, the switches and quiet hours that hold them back, and the pruning of
// what was already shown.

export interface Note {
  title: string;
  body: string;
}

/** At most this many separate notifications per category per run; more become one summary. */
export const MAX_PER_KIND = 3;

/** `notes`, or one summary of them when there are more than MAX_PER_KIND. */
export function summarise(notes: Note[], summary: (n: number) => Note): Note[] {
  return notes.length > MAX_PER_KIND ? [summary(notes.length)] : notes;
}

function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function inQuietHours(prefs: NotificationPrefs, now: Date): boolean {
  const q = prefs.quietHours;
  if (!q.enabled) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  const [start, end] = [minutesOf(q.start), minutesOf(q.end)];
  if (start === end) return false;
  return start < end ? t >= start && t < end : t >= start || t < end;
}

/** Nothing may show now: notifications are off, or it's quiet hours. */
export const isMuted = (prefs: NotificationPrefs, now: Date) =>
  !prefs.enabled || inQuietHours(prefs, now);

/** The entries of a "shown at" record younger than `keepMs`. */
export function pruneShown<T>(
  record: Record<string, T>,
  at: (value: T) => number,
  now: number,
  keepMs: number,
): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => now - at(v) < keepMs));
}
