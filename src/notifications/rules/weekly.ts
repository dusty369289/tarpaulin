import { addDays, addHours, format, startOfWeek } from 'date-fns';
import { dayKey } from '../../lib/days';
import { levelName, loadByDay, weekLoad, type LoadSource } from '../../lib/load';
import { isMuted, type Note } from '../core';
import type { NotificationPrefs } from '../prefs';

// The weekly preview: the evening before the week starts (18:00 on Sunday, or on Saturday when
// weeks start on Sunday), one notification sums up what's due in it, using the same load as the
// Calendar's shading (src/lib/load.ts). A pure function like decideNotifications in
// deadlines.ts; the hook in ../useWeeklyPreview.ts feeds it every minute.
//
// - Once per week: the week it was shown for is remembered per Canvas account.
// - The first look for an account is a baseline: if it lands inside a preview's window, that
//   week counts as shown, so connecting on a Sunday evening doesn't pop one straight away.
// - Quiet hours hold it back without marking it shown, so it arrives when they end. So that a
//   long quiet stretch (or a laptop that was shut) doesn't lose it, the window runs until the
//   end of the week's first day, and from midnight on it's worded "This week".
// - Nothing due, nothing shown (and not marked, so work posted later that evening still gets
//   a preview).

/** Hour of the evening before the week starts. */
const PREVIEW_HOUR = 18;

export interface WeeklyState {
  /** The week (its first day, yyyy-MM-dd) last previewed or baselined; null if none yet. */
  lastWeek: string | null;
}

export interface WeeklyInput {
  /** Work in and around the coming week (as Deadlines); null until loaded. */
  deadlines: LoadSource[] | null;
}

/** The week whose preview window `now` falls in, or null outside every window.
 *  @internal For tests; decideWeeklyPreview uses it. */
export function previewWeek(now: Date, weekStartsOn: 0 | 1): Date | null {
  const current = startOfWeek(now, { weekStartsOn });
  for (const start of [current, addDays(current, 7)]) {
    const from = addHours(addDays(start, -1), PREVIEW_HOUR);
    const until = addDays(start, 1);
    if (now >= from && now < until) return start;
  }
  return null;
}

export function decideWeeklyPreview(
  input: WeeklyInput,
  prefs: NotificationPrefs,
  prev: WeeklyState | null,
  now: Date,
  weekStartsOn: 0 | 1,
): { notes: Note[]; state: WeeklyState } {
  const state: WeeklyState = prev ?? { lastWeek: null };
  const start = previewWeek(now, weekStartsOn);
  if (!start) return { notes: [], state };
  const week = dayKey(start);
  if (state.lastWeek === week) return { notes: [], state };
  // A new account's first look: this week's preview counts as seen.
  if (prev === null) return { notes: [], state: { lastWeek: week } };
  if (!prefs.weekly || isMuted(prefs, now) || !input.deadlines) return { notes: [], state };

  const end = addDays(start, 7);
  const inWeek = input.deadlines.filter((d) => d.date && d.date >= start && d.date < end);
  const load = weekLoad(loadByDay(inWeek, input.deadlines), start);
  if (load.due === 0 || !load.heaviest) return { notes: [], state };

  const when = now < start ? 'Next week' : 'This week';
  const dayName = format(load.heaviest.day, 'EEEE');
  const title =
    load.due === 1
      ? `${when}: 1 due, on ${dayName}`
      : `${when}: ${load.due} due, heaviest on ${dayName} (${load.heaviest.load.due})`;
  const level = levelName(load.level).toLowerCase();
  return {
    notes: [{ title, body: `A ${level} week ahead. Open Tarpaulin to plan it.` }],
    state: { lastWeek: week },
  };
}
