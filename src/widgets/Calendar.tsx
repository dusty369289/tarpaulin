import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { z } from 'zod';
import { useSettings } from '../app/settingsStore';
import { planKeyForPlannerItem, plansOn, useAccountPlans } from '../planner';
import { fromDeadline, fromEvent, type ReaderItem } from '../reader/items';
import { useOpenItem } from '../reader/ReaderProvider';
import {
  SHARED_PLANNER_WINDOW,
  useCourseIds,
  useDeadlines,
  useEvents,
  useUpcoming,
} from '../canvas/hooks';
import type { Deadline } from '../canvas/models';
import { nowInZone, useTimeFormat } from '../lib/dates';
import {
  dayLoad,
  describeLoad,
  loadByDay,
  summariseWeek,
  weekLoad,
  type DayLoad,
  type LoadByDay,
} from '../lib/load';
import { courseFilter, field } from './settings/fields';
import { EmptyState, QueryGate } from './shared/ui';
import { defineWidget } from './types';

// "Today" in the zone times are shown in (Settings › Show times in), not the device's.
const isToday = (d: Date) => isSameDay(d, nowInZone());

const schema = z.object({
  view: field(z.enum(['month', 'week', 'agenda']).default('month'), { label: 'View' }),
  agendaDays: field(z.number().int().min(3).max(31).default(10), {
    label: 'Agenda length',
    unit: 'days',
  }),
  courseIds: courseFilter(),
  showWork: field(z.boolean().default(true), { label: 'Show assignments & quizzes' }),
  showEvents: field(z.boolean().default(true), { label: 'Show calendar events' }),
  showAnnouncements: field(z.boolean().default(false), { label: 'Show announcements' }),
  hideCompleted: field(z.boolean().default(false), { label: 'Hide submitted work' }),
  showLoad: field(z.boolean().default(true), {
    label: 'Show how busy each day is',
    help: 'Marks busy days in the week and month views and sums up the week.',
  }),
});
export type CalendarSettings = z.infer<typeof schema>;

/** A do-date's dot when its work isn't loaded (so its course colour isn't known). */
const PLAN_FALLBACK_COLOR = '#8b93a5';

/** One thing on the calendar: a planner deadline, a Canvas calendar event or a do-date. */
export interface CalendarEntry {
  key: string;
  title: string;
  start: Date;
  /** Events can run over several days; deadlines are a moment. */
  end: Date | null;
  allDay: boolean;
  color: string;
  /** `plan`: a do-date from My plan (src/planner), not a Canvas deadline. */
  kind: 'work' | 'event' | 'announcement' | 'plan';
  done: boolean;
  url: string | null;
  /** What the reader opens; null opens Canvas. */
  item: ReaderItem | null;
}

/** Whether the entry is on day `d`: a multi-day event shows on every day it covers. */
export function onDate(e: CalendarEntry, d: Date): boolean {
  if (isSameDay(e.start, d)) return true;
  // An end at midnight is exclusive: an event ending 00:00 Friday doesn't show on Friday.
  return e.end !== null && e.start < startOfDay(d) && e.end > startOfDay(d);
}

/** The time column: start time on the first day, then "All day", and "–17:00" on the last. */
function timeLabel(e: CalendarEntry, day: Date | null, timeFmt: string): string {
  if (e.kind === 'plan' && e.allDay) return 'Planned';
  if (e.allDay) return 'All day';
  if (!day || isSameDay(e.start, day)) return format(e.start, timeFmt);
  if (e.end && e.end <= endOfDay(day)) return `–${format(e.end, timeFmt)}`;
  return 'All day';
}

/** One row in a day list. At module level, so rows keep their DOM (and focus) across renders. */
function EntryRow({
  e,
  day,
  timeFmt,
  onOpen,
}: {
  e: CalendarEntry;
  /** The day the row is listed under. */
  day: Date | null;
  timeFmt: string;
  onOpen: (e: CalendarEntry) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(e)}
      className="cal-entry flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-2"
    >
      <span className="cal-time w-[4.25rem] shrink-0 whitespace-nowrap text-xs tabular-nums text-muted">
        {timeLabel(e, day, timeFmt)}
      </span>
      <span
        aria-hidden
        className={`h-2.5 w-2.5 shrink-0 ${e.kind === 'event' ? 'rounded-sm' : 'rounded-full'}`}
        style={{ backgroundColor: e.color }}
      />
      <span className={`cal-title min-w-0 truncate ${e.done ? 'text-muted line-through' : ''}`}>
        {e.title}
      </span>
    </button>
  );
}

/** A day's load as a sentence for its label and tooltip; empty when nothing is due. */
function loadNote(load: DayLoad | null): string {
  const text = load && describeLoad(load);
  return text ? `, ${text}` : '';
}
const tooltip = (load: DayLoad | null) => {
  const text = load && describeLoad(load);
  return text ? text[0].toUpperCase() + text.slice(1) : undefined;
};

/** The tint band that marks a busy day (see `.cal-load` in index.css). Purely visual: the
 *  day's label carries the same thing in words. */
function LoadBand({ load }: { load: DayLoad | null }) {
  if (!load || load.level === 'none') return null;
  return <span aria-hidden className="cal-load" data-load={load.level} />;
}

/** Day moves for the month grid's arrow keys. */
const DAY_KEYS: Record<string, (d: Date, weekStartsOn: 0 | 1) => Date> = {
  ArrowLeft: (d) => addDays(d, -1),
  ArrowRight: (d) => addDays(d, 1),
  ArrowUp: (d) => addDays(d, -7),
  ArrowDown: (d) => addDays(d, 7),
  Home: (d, weekStartsOn) => startOfWeek(d, { weekStartsOn }),
  End: (d, weekStartsOn) => startOfDay(endOfWeek(d, { weekStartsOn })),
  PageUp: (d) => addMonths(d, -1),
  PageDown: (d) => addMonths(d, 1),
};

function range(
  view: CalendarSettings['view'],
  cursor: Date,
  weekStartsOn: 0 | 1,
  agendaDays: number,
) {
  if (view === 'month') {
    return {
      start: startOfWeek(startOfMonth(cursor), { weekStartsOn }),
      end: endOfWeek(endOfMonth(cursor), { weekStartsOn }),
    };
  }
  if (view === 'week') {
    return {
      start: startOfWeek(cursor, { weekStartsOn }),
      end: endOfWeek(cursor, { weekStartsOn }),
    };
  }
  const start = startOfDay(cursor);
  return { start, end: addDays(start, agendaDays - 1) };
}

export const Calendar = defineWidget({
  type: 'calendar',
  name: 'Calendar',
  description: 'Deadlines and Canvas calendar events in a month, week or agenda view.',
  icon: CalendarDays,
  defaultSize: { w: 6, h: 10 },
  minSize: { w: 3, h: 5 },
  settingsSchema: schema,
  Component: function CalendarWidget({ settings, size }) {
    const weekStartsOn = useSettings((s) => (s.weekStartsOn === 'monday' ? 1 : 0));
    const [cursor, setCursor] = useState(() => nowInZone());
    const [selected, setSelected] = useState<Date | null>(null);
    const courseIds = useCourseIds(settings.courseIds);
    const openItem = useOpenItem();
    const timeFmt = useTimeFormat();
    // A month grid needs room; fall back to agenda in narrow widgets.
    const view = settings.view === 'month' && size.w < 4 ? 'agenda' : settings.view;
    const { start, end } = range(view, cursor, weekStartsOn, settings.agendaDays);

    const deadlines = useDeadlines(start, end);
    const events = useEvents(settings.showEvents ? courseIds : [], start, end);

    const wide = useUpcoming(SHARED_PLANNER_WINDOW.daysAhead, SHARED_PLANNER_WINDOW.daysBack);
    const plans = useAccountPlans();

    const entries = useMemo(() => {
      const out: CalendarEntry[] = [];
      // Calendar events come from /calendar_events (with times), so skip their planner copies.
      for (const d of deadlines.data
        .inCourses(courseIds)
        .dated()
        .filter((d) => !d.isEvent)) {
        if (d.isAnnouncement ? !settings.showAnnouncements : !settings.showWork) continue;
        if (settings.hideCompleted && d.isDone) continue;
        out.push({
          key: d.key,
          title: d.title,
          start: d.date!,
          end: null,
          allDay: false,
          color: d.color,
          kind: d.isAnnouncement ? 'announcement' : 'work',
          done: d.isDone,
          url: d.url,
          item: fromDeadline(d),
        });
      }
      if (settings.showEvents) {
        for (const e of events.data.filter((e) => e.start !== null)) {
          out.push({
            key: `event:${e.id}`,
            title: e.title,
            start: e.start!,
            end: e.end && e.end > e.start! ? e.end : null,
            allDay: e.allDay,
            color: e.color,
            kind: 'event',
            done: false,
            url: e.url,
            item: fromEvent(e),
          });
        }
      }
      // Do-dates from My plan, beside the due work, in the work's course colour. They're plans,
      // not deadlines, so they stay out of the load below. The shared planner window finds the
      // work even when it's due outside the visible range.
      if (settings.showWork) {
        const work = new Map<string, Deadline>();
        for (const d of [...wide.data, ...deadlines.data]) {
          const key = planKeyForPlannerItem(d);
          if (key) work.set(key, d);
        }
        const courses = new Set(courseIds);
        for (let day = startOfDay(start); day <= end; day = addDays(day, 1)) {
          for (const p of plansOn(plans, day)) {
            if (p.plan.status === 'done' || !courses.has(p.courseId)) continue;
            const d = work.get(p.key);
            if (settings.hideCompleted && d?.isDone) continue;
            out.push({
              key: `plan:${p.key}`,
              title: `Plan: ${d?.title ?? p.plan.title}`,
              start: p.at,
              end: null,
              allDay: !p.hasTime,
              color: d?.color ?? PLAN_FALLBACK_COLOR,
              kind: 'plan',
              done: false,
              url: d?.url ?? null,
              item: d ? fromDeadline(d) : null,
            });
          }
        }
      }
      return out.sort((a, b) => a.start.getTime() - b.start.getTime());
    }, [
      deadlines.data,
      wide.data,
      plans,
      start,
      end,
      events.data,
      courseIds,
      settings.showAnnouncements,
      settings.showWork,
      settings.showEvents,
      settings.hideCompleted,
    ]);

    // How busy each day is: unfinished work only, each item weighed against its course's typical
    // points (src/lib/load.ts). The shared planner window gives every course a fair baseline
    // even in a quiet week; it's the request every planner widget already shares. Only today
    // and later are weighed: what's left on a past day is overdue (Due soon's job), not a crunch
    // to plan around, and "this week" means what's still ahead in it.
    const showLoad = settings.showLoad && settings.showWork && view !== 'agenda';
    const todayMs = startOfDay(nowInZone()).getTime();
    const load = useMemo<LoadByDay | null>(() => {
      if (!showLoad) return null;
      const visible = deadlines.data.inCourses(courseIds).dated();
      const ahead = visible.filter((d) => d.date!.getTime() >= todayMs);
      return loadByDay(ahead, [...wide.data.inCourses(courseIds), ...visible]);
    }, [showLoad, deadlines.data, wide.data, courseIds, todayMs]);
    const loadOn = (d: Date) => (load ? dayLoad(load, d) : null);
    // The week summed up: the visible week, or in the month view the current one (if shown).
    const thisWeek = startOfWeek(nowInZone(), { weekStartsOn });
    const summaryWeek =
      view === 'week' ? start : thisWeek >= start && thisWeek <= end ? thisWeek : null;
    const week = load && summaryWeek ? weekLoad(load, summaryWeek) : null;
    const summary = week && summariseWeek(week, view === 'month');
    // Its own line under the week view's header (that view scrolls); in the month view it sits
    // in the header row, so the grid keeps its height.
    const summaryLine =
      summary && week ? (
        <p
          className={`cal-summary flex min-w-0 flex-1 items-center gap-1.5 text-xs ${view === 'month' ? 'ml-1' : ''} ${week.level === 'light' ? 'text-muted' : ''}`}
          title={summary}
        >
          <span aria-hidden className="cal-load-dot" data-load={week.level} />
          <span className="truncate">{summary}</span>
        </p>
      ) : null;

    // Entries are already in time order.
    const onDay = (d: Date) => entries.filter((e) => onDate(e, d));
    // In month cells only a few chips fit, so unfinished work goes first and isn't hidden
    // behind "+N more".
    const inCell = (d: Date) =>
      onDay(d).sort(
        (a, b) => Number(a.done) - Number(b.done) || a.start.getTime() - b.start.getTime(),
      );
    const step = (dir: 1 | -1) => {
      setSelected(null);
      setFocusDay(null);
      setCursor((c) =>
        view === 'month'
          ? addMonths(c, dir)
          : view === 'week'
            ? addWeeks(c, dir)
            : addDays(c, dir * settings.agendaDays),
      );
    };
    const title =
      view === 'month'
        ? format(cursor, 'MMMM yyyy')
        : `${format(start, 'd MMM')} – ${format(end, 'd MMM')}`;

    const onOpen = (e: CalendarEntry) => openItem(e.item, e.url);
    const row = (e: CalendarEntry, d: Date | null) => (
      <EntryRow key={e.key} e={e} day={d} timeFmt={timeFmt} onOpen={onOpen} />
    );

    // Month grid keyboard: one day is the Tab stop and arrow keys move it, paging the month
    // when they leave it.
    const gridRef = useRef<HTMLDivElement>(null);
    const [focusDay, setFocusDay] = useState<Date | null>(null);
    const refocus = useRef(false);
    const tabDay =
      focusDay ?? selected ?? (isSameMonth(nowInZone(), cursor) ? nowInZone() : cursor);
    useEffect(() => {
      if (!refocus.current || !focusDay) return;
      refocus.current = false;
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-day="${format(focusDay, 'yyyy-MM-dd')}"]`)
        ?.focus();
    });
    const onGridKey = (ev: KeyboardEvent) => {
      const move = DAY_KEYS[ev.key];
      if (!move) return;
      ev.preventDefault();
      const next = move(focusDay ?? tabDay, weekStartsOn);
      if (!isSameMonth(next, cursor)) setCursor(startOfMonth(next));
      refocus.current = true;
      setFocusDay(next);
    };

    const weekdays = eachDayOfInterval({
      start: startOfWeek(nowInZone(), { weekStartsOn }),
      end: endOfWeek(nowInZone(), { weekStartsOn }),
    });

    return (
      <div className="flex h-full flex-col w-gap">
        <div className="flex items-center gap-1">
          <button type="button" className="btn-icon" aria-label="Previous" onClick={() => step(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className="btn-icon" aria-label="Next" onClick={() => step(1)}>
            <ChevronRight className="h-4 w-4" />
          </button>
          {view === 'month' && summaryLine ? (
            <>
              <span className="shrink-0 font-semibold">{title}</span>
              {summaryLine}
            </>
          ) : (
            <span className="flex-1 truncate font-semibold">{title}</span>
          )}
          <button
            type="button"
            className="btn btn-ghost px-2 py-0.5 text-xs"
            onClick={() => {
              setCursor(nowInZone());
              setSelected(null);
              setFocusDay(null);
            }}
          >
            Today
          </button>
        </div>
        {view === 'week' && summaryLine}
        {/* A failing events request shouldn't hide the deadlines, so it gets its own hint. */}
        {settings.showEvents && events.query.isError && !events.query.data && (
          <p className="text-xs text-danger" role="alert">
            Couldn’t load calendar events from Canvas.
          </p>
        )}
        <QueryGate
          queries={[
            deadlines.query,
            { isLoading: events.query.isLoading, isError: false, error: null },
          ]}
        >
          {() => {
            if (view === 'month') {
              const days = eachDayOfInterval({ start, end });
              const picked = selected ? onDay(selected) : [];
              // How many 16px event chips fit under the day number in a cell of this widget size.
              const widgetPx = size.h * 36 + (size.h - 1) * 12;
              const cellPx = (widgetPx - 112 - (selected ? 90 : 0)) / (days.length / 7);
              const chipSlots =
                size.w >= 6 ? Math.max(0, Math.min(3, Math.floor((cellPx - 20) / 17))) : 0;
              // What's coming up from today (or the start of the month) for the side list.
              const from = start > startOfDay(nowInZone()) ? start : startOfDay(nowInZone());
              const upcoming = days.filter((d) => d >= from).filter((d) => onDay(d).length > 0);
              return (
                <div className="cal-month min-h-0 flex-1">
                  <div className="cal-month-body">
                    <div className="flex min-h-0 flex-1 flex-col gap-2">
                      <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-muted">
                        {weekdays.map((d) => (
                          <div key={d.toISOString()}>
                            {format(d, size.w >= 6 ? 'EEE' : 'EEEEE')}
                          </div>
                        ))}
                      </div>
                      <div
                        ref={gridRef}
                        role="group"
                        aria-label={`${format(cursor, 'MMMM yyyy')}: arrow keys move between days`}
                        className="grid flex-1 grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-border"
                        style={{ gridAutoRows: '1fr' }}
                      >
                        {days.map((d) => {
                          const list = inCell(d);
                          const isSel = selected && isSameDay(d, selected);
                          const dl = loadOn(d);
                          return (
                            <button
                              type="button"
                              key={d.toISOString()}
                              data-day={format(d, 'yyyy-MM-dd')}
                              tabIndex={isSameDay(d, tabDay) ? 0 : -1}
                              onFocus={() => setFocusDay(d)}
                              onKeyDown={onGridKey}
                              onClick={() => setSelected(isSel ? null : d)}
                              aria-label={`${format(d, 'EEEE d MMMM')}, ${list.length} item${list.length === 1 ? '' : 's'}${loadNote(dl)}`}
                              title={tooltip(dl)}
                              data-load={dl && dl.level !== 'none' ? dl.level : undefined}
                              aria-pressed={Boolean(isSel)}
                              className={`relative flex min-h-0 flex-col items-stretch gap-0.5 overflow-hidden p-0.5 text-left focus-visible:outline-offset-[-2px] ${isSameMonth(d, cursor) ? 'bg-surface' : 'cal-out text-muted'} ${isSel ? 'ring-2 ring-inset ring-accent' : ''}`}
                            >
                              <LoadBand load={dl} />
                              <span
                                className={`self-end rounded-full px-1 text-[11px] tabular-nums ${isToday(d) ? 'bg-accent text-accent-fg' : ''}`}
                              >
                                {format(d, 'd')}
                              </span>
                              {chipSlots > 0
                                ? list
                                    .slice(0, list.length > chipSlots ? chipSlots - 1 : chipSlots)
                                    .map((e) => (
                                      <span
                                        key={e.key}
                                        className={`truncate rounded px-1 text-[11px] leading-4 ${e.done ? 'text-muted line-through' : ''}`}
                                        style={{
                                          backgroundColor: `${e.color}${e.done ? '12' : '22'}`,
                                          borderLeft: `2px solid ${e.color}`,
                                        }}
                                      >
                                        {e.title}
                                      </span>
                                    ))
                                : null}
                              {chipSlots > 0 && list.length > chipSlots && (
                                <span className="px-1 text-[11px] leading-4 text-muted">
                                  +{list.length - chipSlots + 1} more
                                </span>
                              )}
                              {chipSlots === 0 && list.length > 0 && (
                                <span className="flex flex-wrap justify-center gap-0.5">
                                  {list.slice(0, 4).map((e) => (
                                    <span
                                      key={e.key}
                                      className="h-1.5 w-1.5 rounded-full"
                                      style={{ backgroundColor: e.color }}
                                    />
                                  ))}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {selected ? (
                      <div className="cal-selected max-h-[40%] overflow-auto scroll-thin">
                        <div className="mb-1 text-xs font-semibold text-muted">
                          {format(selected, 'EEEE d MMMM')}
                        </div>
                        {picked.length ? (
                          picked.map((e) => row(e, selected))
                        ) : (
                          <div className="text-xs text-muted">Nothing on this day.</div>
                        )}
                      </div>
                    ) : (
                      <div
                        className="cal-upcoming scroll-thin"
                        aria-label="Coming up"
                        role="region"
                      >
                        {upcoming.length ? (
                          upcoming.map((d) => (
                            <section
                              key={d.toISOString()}
                              aria-label={format(d, 'EEEE d MMMM')}
                              className="mb-1.5"
                            >
                              <h3
                                className={`text-[11px] font-semibold uppercase tracking-wide ${isToday(d) ? 'text-accent' : 'text-muted'}`}
                              >
                                {format(d, 'EEE d MMM')}
                                {isToday(d) && ' · Today'}
                              </h3>
                              {onDay(d).map((e) => row(e, d))}
                            </section>
                          ))
                        ) : (
                          <div className="text-xs text-muted">Nothing else this month.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            const days = eachDayOfInterval({ start, end });
            const anything = days.some((d) => onDay(d).length > 0);
            if (!anything) return <EmptyState>Nothing scheduled.</EmptyState>;
            // Week: seven columns when wide (`.cal-week`). Agenda: days flow into columns.
            return (
              <div className="cal-list">
                <div
                  className={
                    view === 'week' ? 'cal-week flex flex-col gap-2' : 'wide-groups [--col:15em]'
                  }
                  data-shaded={(view === 'week' && load !== null) || undefined}
                >
                  {days.map((d) => {
                    const list = onDay(d);
                    if (view === 'agenda' && list.length === 0) return null;
                    const dl = view === 'week' ? loadOn(d) : null;
                    return (
                      <section
                        key={d.toISOString()}
                        aria-label={`${format(d, 'EEEE d MMMM')}${loadNote(dl)}`}
                        data-today={isToday(d) || undefined}
                        data-load={dl && dl.level !== 'none' ? dl.level : undefined}
                      >
                        <LoadBand load={dl} />
                        <h3
                          title={tooltip(dl)}
                          className={`text-[11px] font-semibold uppercase tracking-wide ${isToday(d) ? 'text-accent' : 'text-muted'}`}
                        >
                          {format(d, 'EEE d MMM')}
                          {isToday(d) && ' · Today'}
                        </h3>
                        {list.length ? (
                          list.map((e) => row(e, d))
                        ) : (
                          <div className="px-1 text-xs text-muted/70">—</div>
                        )}
                      </section>
                    );
                  })}
                </div>
              </div>
            );
          }}
        </QueryGate>
      </div>
    );
  },
});
