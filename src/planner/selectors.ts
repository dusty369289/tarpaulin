import { atTime, dayKey, formatDay, formatDayTime } from '../lib/dates';
import type { WorkKind } from '../canvas/kinds';
import type { Deadline } from '../canvas/models';
import { plural } from '../lib/text';
import { parsePlanItemKey, planKeyForPlannerItem } from './keys';
import type { AccountPlans, DoDate, Plan, PlanMeta, PlanStatus } from './store';

// Small, pure reads of plans, for the reader, Due soon, the reminder and the calendar.

export const STATUS_LABEL: Record<PlanStatus, string> = {
  todo: 'Not started',
  doing: 'In progress',
  done: 'Done',
};

/** Not started → In progress → Done → Not started. */
export const nextStatus = (s: PlanStatus): PlanStatus =>
  s === 'todo' ? 'doing' : s === 'doing' ? 'done' : 'todo';

/** When reminders and the calendar place a do-date without a time. */
export const DEFAULT_DO_TIME = '09:00';

/** The do-date as a Date: that day at its time, or at the start of the day without one. */
export function doDateAt(doDate: DoDate, fallbackTime = '00:00'): Date {
  return atTime(doDate.day, doDate.time ?? fallbackTime);
}

/** "Today", "Tomorrow", "Tue", "12 Nov", "12 Nov 2027"; with ", 14:00" when a time is set. */
export function formatDoDate(doDate: DoDate, now: Date, timeFmt = 'HH:mm'): string {
  const at = doDateAt(doDate);
  return doDate.time
    ? formatDayTime(at, now, timeFmt, { timeBeyondWeek: true })
    : formatDay(at, now);
}

export interface PlanSummary {
  status: PlanStatus;
  doDate: DoDate | null;
  stepsDone: number;
  stepsTotal: number;
  /** "Planned for Tue · 2 of 4 steps", "Done · 4 of 4 steps", "Not planned yet". */
  label: string;
}

/** A plan at a glance. A missing plan reads as not started and unplanned. */
export function planSummary(
  plan: Plan | null | undefined,
  now: Date,
  timeFmt = 'HH:mm',
): PlanSummary {
  const status = plan?.status ?? 'todo';
  const doDate = plan?.doDate ?? null;
  const steps = plan?.checklist ?? [];
  const stepsDone = steps.filter((s) => s.done).length;
  const parts: string[] = [];
  if (status !== 'todo') parts.push(STATUS_LABEL[status]);
  if (doDate) parts.push(`Planned for ${formatDoDate(doDate, now, timeFmt)}`);
  if (steps.length) parts.push(`${stepsDone} of ${plural(steps.length, 'step')}`);
  return {
    status,
    doDate,
    stepsDone,
    stepsTotal: steps.length,
    label: parts.join(' · ') || 'Not planned yet',
  };
}

export interface PlannedItem {
  key: string;
  kind: WorkKind;
  courseId: string;
  id: string;
  plan: Plan;
  /** The do-date as a Date (start of the day when it has no time). */
  at: Date;
  hasTime: boolean;
}

/**
 * Items planned from `first` to `last` (whole days, inclusive), by day; within a day untimed
 * first, then by time. For the calendar.
 */
export function plansBetween(plans: AccountPlans, first: Date, last: Date): PlannedItem[] {
  const [from, to] = [dayKey(first), dayKey(last)];
  const out: PlannedItem[] = [];
  for (const [key, plan] of Object.entries(plans)) {
    const ref = parsePlanItemKey(key);
    const day = plan.doDate?.day;
    if (!ref || !plan.doDate || !day || day < from || day > to) continue;
    out.push({ key, ...ref, plan, at: doDateAt(plan.doDate), hasTime: plan.doDate.time !== null });
  }
  return out.sort(
    (a, b) =>
      a.plan.doDate!.day.localeCompare(b.plan.doDate!.day) ||
      Number(a.hasTime) - Number(b.hasTime) ||
      a.at.getTime() - b.at.getTime() ||
      a.plan.title.localeCompare(b.plan.title),
  );
}

/** Items planned for `day` (any time that day), untimed first, then by time. */
export const plansOn = (plans: AccountPlans, day: Date) => plansBetween(plans, day, day);

/** Planner items by plan key, for joining plans to what Canvas says now. Later items win. */
export function indexByPlanKey(deadlines: Iterable<Deadline>): Map<string, Deadline> {
  const out = new Map<string, Deadline>();
  for (const d of deadlines) {
    const key = planKeyForPlannerItem(d);
    if (key) out.set(key, d);
  }
  return out;
}

/** What a plan keeps of its Canvas item (for reminders and the calendar when it isn't loaded). */
export const planMetaOf = (d: Deadline): PlanMeta => ({
  title: d.title,
  courseName: d.courseName,
  dueAt: d.data.dueAt ?? d.data.date,
});
