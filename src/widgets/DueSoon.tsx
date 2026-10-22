import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { z } from 'zod';
import { fromDeadline } from '../reader/items';
import { useOpenItem } from '../reader/ReaderProvider';
import { useCourseIds, useNow, useUpcoming } from '../canvas/hooks';
import type { Deadline, Deadlines } from '../canvas/models';
import { formatDue, useTimeFormat } from '../lib/dates';
import { formatPoints } from '../lib/text';
import { useAccountPlans, usePlanActions } from '../planner/hooks';
import { planKeyForPlannerItem } from '../planner/keys';
import { PlanChips, PlanStatusButton } from '../planner/PlanBits';
import { planSummary } from '../planner/selectors';
import type { PlanStatus } from '../planner/store';
import { courseFilter, field } from './settings/fields';
import { CourseDot, DeadlineStatusBadge, EmptyState, LinkButton, QueryGate } from './shared/ui';
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
    const plans = useAccountPlans();
    const { cycleStatus } = usePlanActions();
    const planOf = (d: Deadline) => {
      const key = planKeyForPlannerItem(d);
      return key ? (plans[key] ?? null) : undefined;
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
                                <span className="whitespace-nowrap">
                                  {formatPoints(d.points, { short: true })}
                                </span>
                              )}
                              <DeadlineStatusBadge deadline={d} now={now} />
                              {plan && (
                                <PlanChips
                                  summary={planSummary(plan, now, timeFmt)}
                                  now={now}
                                  timeFmt={timeFmt}
                                />
                              )}
                            </div>
                          </div>
                          {plan !== undefined && (
                            <PlanStatusButton
                              title={d.title}
                              status={plan?.status ?? 'todo'}
                              onCycle={() => cycleStatus(d)}
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
