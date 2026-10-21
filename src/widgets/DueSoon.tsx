import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { z } from 'zod';
import { useCanvas } from '../canvas/CanvasProvider';
import { useCourseIds, useNow, useUpcoming } from '../canvas/hooks';
import type { Deadline, Deadlines, DeadlineStatus } from '../canvas/models';
import { formatDue, useTimeFormat } from '../lib/dates';
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
  >,
  courseIds: string[] | null,
  now: Date,
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
  const due = (d: Deadline) => d.date!.getTime();
  const sorted =
    opts.sortBy === 'course'
      ? list.sortBy((d) => d.courseName.toLowerCase(), due)
      : opts.sortBy === 'points'
        ? list.sortBy((d) => -(d.points ?? 0), due)
        : list.sortByDue();
  return sorted.take(opts.maxItems);
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
    const { openLink } = useCanvas();
    const timeFmt = useTimeFormat();

    return (
      <QueryGate queries={[deadlines.query]}>
        {() => {
          const items = selectDueSoon(deadlines.data, settings, courseIds, now);
          if (items.isEmpty) {
            return (
              <EmptyState icon={<CheckCircle2 className="h-6 w-6 text-success" aria-hidden />}>
                Nothing due in the next {settings.daysAhead} days.
              </EmptyState>
            );
          }
          const groups = items.groupBy((d) =>
            settings.groupBy === 'day'
              ? dayLabel(d.date!, now)
              : settings.groupBy === 'course'
                ? d.courseName
                : '',
          );
          return (
            <div className="flex flex-col w-gap">
              {[...groups].map(([label, group]) => (
                <section key={label || 'all'} aria-label={label || 'Due soon'}>
                  {label && (
                    <h3
                      className={`mb-1 truncate text-[11px] font-semibold uppercase tracking-wide ${label === 'Overdue' ? 'text-danger' : 'text-muted'}`}
                    >
                      {label}
                    </h3>
                  )}
                  <ul className="flex flex-col w-gap">
                    {group.map((d) => (
                      <li key={d.key} className="flex items-start gap-2" data-testid="due-item">
                        <CourseDot color={d.color} className="mt-1.5" />
                        <div className="min-w-0 flex-1">
                          <LinkButton
                            onClick={() => openLink(d.url)}
                            className={`block truncate font-medium ${d.isDone ? 'text-muted line-through' : ''}`}
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
                          </div>
                        </div>
                      </li>
                    ))}
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
