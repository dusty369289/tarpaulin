import { differenceInCalendarDays, format, isSameYear, parse } from 'date-fns';
import { parsePlanItemKey, type PlanItemType } from './keys';
import type { AccountPlans, DoDate, Plan, PlanStatus } from './store';

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

/** yyyy-MM-dd of a local date. */
export const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

/** The do-date as a Date: that day at its time, or at the start of the day without one. */
export function doDateAt(doDate: DoDate, fallbackTime = '00:00'): Date {
  return parse(`${doDate.day} ${doDate.time ?? fallbackTime}`, 'yyyy-MM-dd HH:mm', new Date());
}

/** "Today", "Tomorrow", "Tue", "12 Nov", "12 Nov 2027"; with ", 14:00" when a time is set. */
export function formatDoDate(doDate: DoDate, now: Date, timeFmt = 'HH:mm'): string {
  const at = doDateAt(doDate);
  const days = differenceInCalendarDays(at, now);
  const name =
    days === 0
      ? 'Today'
      : days === 1
        ? 'Tomorrow'
        : days === -1
          ? 'Yesterday'
          : days > 1 && days < 7
            ? format(at, 'EEE')
            : format(at, isSameYear(at, now) ? 'd MMM' : 'd MMM yyyy');
  return doDate.time ? `${name} ${format(doDateAt(doDate), timeFmt)}` : name;
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
  if (steps.length)
    parts.push(`${stepsDone} of ${steps.length} step${steps.length === 1 ? '' : 's'}`);
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
  type: PlanItemType;
  courseId: string;
  id: string;
  plan: Plan;
  /** The do-date as a Date (start of the day when it has no time). */
  at: Date;
  hasTime: boolean;
}

/** Items planned for `day` (any time that day), untimed first, then by time. For the calendar. */
export function plansOn(plans: AccountPlans, day: Date): PlannedItem[] {
  const want = dayKey(day);
  const out: PlannedItem[] = [];
  for (const [key, plan] of Object.entries(plans)) {
    const ref = parsePlanItemKey(key);
    if (!ref || plan.doDate?.day !== want) continue;
    out.push({ key, ...ref, plan, at: doDateAt(plan.doDate), hasTime: plan.doDate.time !== null });
  }
  return out.sort(
    (a, b) =>
      Number(a.hasTime) - Number(b.hasTime) ||
      a.at.getTime() - b.at.getTime() ||
      a.plan.title.localeCompare(b.plan.title),
  );
}
