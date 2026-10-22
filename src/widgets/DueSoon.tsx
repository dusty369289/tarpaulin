import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns';
import { CheckCircle2, ClipboardList, ListChecks } from 'lucide-react';
import { z } from 'zod';
import { fromDeadline } from '../reader/items';
import { useOpenItem } from '../reader/ReaderProvider';
import { useCourseIds, useNow, useUpcoming } from '../canvas/hooks';
import type { Deadline, Deadlines, DeadlineStatus } from '../canvas/models';
import { formatDue, useTimeFormat } from '../lib/dates';
import { useAccountScope } from '../canvas/account';
import { useAccountPlans } from '../planner/hooks';
import { planKeyForPlannerItem } from '../planner/keys';
import { PlanStatusIcon } from '../planner/PlanStatusIcon';
import { formatDoDate, nextStatus, STATUS_LABEL } from '../planner/selectors';
import { usePlans, type Plan, type PlanStatus } from '../planner/store';
import { courseFilter, field } from './settings/fields';
import { Badge, CourseDot, EmptyState, LinkButton, QueryGate } from './shared/ui';
import { defineWidget } from './types';

const schema = z.object({
  daysAhead: field(z.number().int().min(1).max(60).default(14), {
    label: 'Look ahead',
    unit: 'days',
  }),
  overdueDays: field(z.number().int().min(0).max(30).default(7), {
    label: 'Show overdue from the last',
    unit: 'days',
    help: '0 hides overdue work.',
  }),
  courseIds: courseFilter(),
  include: field(z.enum(['work', 'all']).default('work'), {
    label: 'Include',
    options: { work: 'Things to hand in', all: 'Everything with a date (except announcements)' },
  }),
  showCompleted: field(z.boolean().default(false), { label: 'Show submitted / done' }),
  hidePlanDone: field(z.boolean().default(false), {
    label: 'Hide work I’ve marked done',
    help: 'Done in your own plan (kept on this device), whatever Canvas says.',
  }),
  sortBy: field(z.enum(['due', 'course', 'points']).default('due'), {
    label: 'Sort by',
    options: { due: 'Due date', course: 'Course', points: 'Points (high first)' },
  }),
  groupBy: field(z.enum(['none', 'day', 'course']).default('day'), { label: 'Group by' }),
  showCourse: field(z.boolean().default(true), { label: 'Show course name' }),
  showPoints: field(z.boolean().default(false), { label: 'Show points' }),
  maxItems: field(z.number().int().min(1).max(100).default(30), { label: 'Max items' }),
});
export type DueSoonSettings = z.infer<typeof schema>;

/** What the widget lists, as a chain over the planner (tested against recorded fixtures). */
export function selectDueSoon(
  deadlines: Deadlines,
  opts: Pick<
    DueSoonSettings,
    'daysAhead' | 'overdueDays' | 'include' | 'showCompleted' | 'sortBy' | 'maxItems'
  > &
    Partial<Pick<DueSoonSettings, 'hidePlanDone' | 'groupBy'>>,
  courseIds: string[] | null,
  now: Date,
  /** Your own plan's status of an item, if it has one (src/planner). */
  planStatus: (d: Deadline) => PlanStatus | undefined = () => undefined,
): Deadlines {
  const from = addDays(startOfDay(now), -opts.overdueDays);
  const until = addDays(startOfDay(now), opts.daysAhead + 1);
  let list = deadlines
    .withoutAnnouncements()
    .inCourses(courseIds)
    .between(opts.overdueDays > 0 ? from : now, until)
    // Past items only stay while they're still outstanding.
    .filter((d) => d.date! >= now || !d.isDone);
  if (opts.include === 'work') list = list.work();
  if (!opts.showCompleted) list = list.undone();
  const planDone = (d: Deadline) => planStatus(d) === 'done';
  if (opts.hidePlanDone) list = list.filter((d) => !planDone(d));
  const due = (d: Deadline) => d.date!.getTime();
  const sorted =
    opts.sortBy === 'course'
      ? list.sortBy((d) => d.courseName.toLowerCase(), due)
      : opts.sortBy === 'points'
        ? list.sortBy((d) => -(d.points ?? 0), due)
        : list.sortByDue();
  // Work done in your plan goes after the rest of its group (the whole list when ungrouped),
  // leaving the groups in their order.
  const groupOf = (d: Deadline) => groupLabel(d, opts.groupBy ?? 'none', now);
  const groupRank = new Map<string, number>();
  for (const d of sorted) if (!groupRank.has(groupOf(d))) groupRank.set(groupOf(d), groupRank.size);
  return sorted
    .sortBy(
      (d) => groupRank.get(groupOf(d)),
      (d) => (planDone(d) ? 1 : 0),
    )
    .take(opts.maxItems);
}

/** The heading an item is listed under ('' when ungrouped). */
function groupLabel(d: Deadline, groupBy: DueSoonSettings['groupBy'], now: Date) {
  return groupBy === 'day' ? dayLabel(d.date!, now) : groupBy === 'course' ? d.courseName : '';
}

function dayLabel(date: Date, now: Date) {
  const diff = differenceInCalendarDays(date, now);
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return format(date, 'EEEE');
  return format(date, 'EEE d MMM');
}

const STATUS_BADGE: Partial<
  Record<DeadlineStatus, [tone: 'danger' | 'warning' | 'success' | 'muted', label: string]>
> = {
  excused: ['muted', 'Excused'],
  graded: ['success', 'Graded'],
  submitted: ['success', 'Submitted'],
  'submitted-late': ['success', 'Submitted late'],
  done: ['success', 'Done'],
  missing: ['danger', 'Missing'],
  overdue: ['danger', 'Overdue'],
  'due-today': ['warning', 'Due today'],
};

function Status({ deadline, now }: { deadline: Deadline; now: Date }) {
  const badge = STATUS_BADGE[deadline.status(now)];
  return badge ? <Badge tone={badge[0]}>{badge[1]}</Badge> : null;
}

/** The do-date and checklist progress, for the row's meta line. */
function PlanChips({ plan, now, timeFmt }: { plan: Plan; now: Date; timeFmt: string }) {
  const done = plan.checklist.filter((s) => s.done).length;
  const total = plan.checklist.length;
  return (
    <>
      {plan.doDate && (
        <span className="chip chip-tone whitespace-nowrap [--tone:var(--accent)]">
          Plan: {formatDoDate(plan.doDate, now, timeFmt)}
        </span>
      )}
      {total > 0 && (
        <span
          className="inline-flex items-center gap-0.5 whitespace-nowrap"
          aria-label={`${done} of ${total} steps done`}
          title={`${done} of ${total} steps done`}
        >
          <ListChecks className="h-3 w-3" aria-hidden />
          {done}/{total}
        </span>
      )}
    </>
  );
}

/** The plan's status mark, and a click to move it on: Not started → In progress → Done. */
function PlanStatusButton({
  title,
  status,
  onCycle,
}: {
  title: string;
  status: PlanStatus;
  onCycle: () => void;
}) {
  const next = STATUS_LABEL[nextStatus(status)];
  return (
    <button
      type="button"
      className="btn-icon -my-0.5 h-6 w-6 shrink-0"
      aria-label={`${title}: ${STATUS_LABEL[status]} in my plan. Mark ${next.toLowerCase()}`}
      title={`My plan: ${STATUS_LABEL[status]}. Click for ${next.toLowerCase()}.`}
      data-testid="plan-status"
      data-status={status}
      onClick={onCycle}
    >
      <PlanStatusIcon status={status} />
    </button>
  );
}

export const DueSoon = defineWidget({
  type: 'due-soon',
  name: 'Due soon',
  description: 'Upcoming assignments, quizzes and graded discussions, with overdue work flagged.',
  icon: ClipboardList,
  defaultSize: { w: 4, h: 9 },
  minSize: { w: 3, h: 4 },
  settingsSchema: schema,
  Component: function DueSoonWidget({ settings }) {
    const now = useNow(60_000);
    const courseIds = useCourseIds(settings.courseIds);
    const deadlines = useUpcoming(settings.daysAhead, settings.overdueDays);
    const openItem = useOpenItem();
    const timeFmt = useTimeFormat();
    const account = useAccountScope();
    const plans = useAccountPlans();
    const editPlan = usePlans((s) => s.edit);
    const planOf = (d: Deadline) => {
      const key = planKeyForPlannerItem(d);
      return key ? (plans[key] ?? null) : undefined;
    };
    const cycle = (d: Deadline) => {
      const key = planKeyForPlannerItem(d);
      if (!account || !key) return;
      editPlan(account, key, (p) => ({ status: nextStatus(p.status) }), {
        title: d.title,
        courseName: d.courseName,
        dueAt: d.data.dueAt ?? d.data.date,
      });
    };

    return (
      <QueryGate queries={[deadlines.query]}>
        {() => {
          const items = selectDueSoon(
            deadlines.data,
            settings,
            courseIds,
            now,
            (d) => planOf(d)?.status,
          );
          if (items.isEmpty) {
            return (
              <EmptyState icon={<CheckCircle2 className="h-6 w-6 text-success" aria-hidden />}>
                Nothing due in the next {settings.daysAhead} days.
              </EmptyState>
            );
          }
          const groups = items.groupBy((d) => groupLabel(d, settings.groupBy, now));
          return (
            // Narrow: one column. Wide: groups side by side, and a lone group spreads its items out.
            <div className="wide-groups">
              {[...groups].map(([label, group]) => (
                <section key={label || 'all'} aria-label={label || 'Due soon'}>
                  {label && (
                    <h3
                      className={`mb-1 truncate text-[11px] font-semibold uppercase tracking-wide ${label === 'Overdue' ? 'text-danger' : 'text-muted'}`}
                    >
                      {label}
                    </h3>
                  )}
                  <ul className="wide-grid">
                    {group.map((d) => {
                      // undefined: not something you plan; null: nothing planned yet.
                      const plan = planOf(d);
                      const planDone = plan?.status === 'done';
                      return (
                        <li
                          key={d.key}
                          className="flex items-start gap-2"
                          data-testid="due-item"
                          data-plan-status={plan?.status}
                        >
                          <CourseDot
                            color={d.color}
                            className={`mt-1.5 ${planDone ? 'opacity-40' : ''}`}
                          />
                          <div className="min-w-0 flex-1">
                            <LinkButton
                              onClick={() => openItem(fromDeadline(d), d.url)}
                              className={`block truncate font-medium ${d.isDone ? 'text-muted line-through' : planDone ? 'text-muted' : ''}`}
                            >
                              {d.title}
                            </LinkButton>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                              <span className="whitespace-nowrap">
                                {formatDue(d.date!, now, timeFmt)}
                              </span>
                              {settings.showCourse && (
                                <span className="min-w-0 truncate">{d.courseName}</span>
                              )}
                              {settings.showPoints && d.points != null && (
                                <span className="whitespace-nowrap">{d.points} pts</span>
                              )}
                              <Status deadline={d} now={now} />
                              {plan && <PlanChips plan={plan} now={now} timeFmt={timeFmt} />}
                            </div>
                          </div>
                          {plan !== undefined && (
                            <PlanStatusButton
                              title={d.title}
                              status={plan?.status ?? 'todo'}
                              onCycle={() => cycle(d)}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          );
        }}
      </QueryGate>
    );
  },
});
