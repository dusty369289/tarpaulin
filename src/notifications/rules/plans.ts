import { format } from 'date-fns';
import { DEFAULT_DO_TIME, dayKey, doDateAt } from '../../planner/selectors';
import type { DoDate } from '../../planner/store';
import { isMuted, pruneShown, summarise, type Note } from '../core';
import type { NotificationPrefs } from '../prefs';

// "Planned for today: Problem set 4", on the day you planned to do a piece of work (My plan,
// src/planner): at the time you set, or at 09:00 without one. Kept apart from deadlines.ts, with
// its own saved state, so the other reminders can change without touching it.
//
// - Once per item and do-date: moving the do-date to another day or time reminds again.
// - Only on the do-date itself: a day the app wasn't open is skipped, not caught up on later.
// - Quiet hours hold it back without marking it shown, so it comes once they end (that day).
// - Nothing for work done in your plan or handed in on Canvas.

export interface PlanReminderInput {
  /** Plan item key (`assignment:<courseId>:<id>`). */
  key: string;
  title: string;
  courseName: string;
  doDate: DoDate;
  /** Done in your plan, or submitted / excused / graded in Canvas. */
  done: boolean;
}

export interface PlanReminderState {
  /** `<key>@<day>T<time>` → when it was shown (ms). */
  shown: Record<string, number>;
}

export const EMPTY_PLAN_REMINDER_STATE: PlanReminderState = { shown: {} };

const KEEP_MS = 14 * 24 * 60 * 60_000;

export function decidePlanReminders(
  plans: PlanReminderInput[],
  prefs: NotificationPrefs,
  prev: PlanReminderState,
  now: Date,
  timeFmt = 'h:mm a',
): { notes: Note[]; state: PlanReminderState } {
  const nowMs = now.getTime();
  const state: PlanReminderState = {
    shown: pruneShown(prev.shown ?? {}, (at) => at, nowMs, KEEP_MS),
  };
  if (!prefs.planned || isMuted(prefs, now)) return { notes: [], state };

  const today = dayKey(now);
  const due: Note[] = [];
  for (const p of plans) {
    if (p.done || p.doDate.day !== today) continue;
    const time = p.doDate.time ?? DEFAULT_DO_TIME;
    if (now < doDateAt(p.doDate, DEFAULT_DO_TIME)) continue;
    const id = `${p.key}@${p.doDate.day}T${time}`;
    if (state.shown[id] !== undefined) continue;
    state.shown[id] = nowMs;
    const at = p.doDate.time ? format(doDateAt(p.doDate), timeFmt) : '';
    due.push({
      title: `Planned for today: ${p.title || 'Untitled'}`,
      body: [p.courseName, at].filter(Boolean).join(' · ') || 'My plan',
    });
  }
  const notes = summarise(due, (n) => ({
    title: `${n} things planned for today`,
    body: 'Open Tarpaulin to see your plan.',
  }));
  return { notes, state };
}
