import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { useSettings } from '../app/settingsStore';
import { fromDeadline, fromEvent, type ReaderItem } from '../reader/items';
import { useOpenItem } from '../reader/ReaderProvider';
import { useCourseIds, useDeadlines, useEvents } from '../canvas/hooks';
import { useTimeFormat } from '../lib/dates';
import { courseFilter, field } from './settings/fields';
import { EmptyState, QueryGate } from './shared/ui';
import { defineWidget } from './types';

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
});
export type CalendarSettings = z.infer<typeof schema>;

/** One thing on the calendar: a planner deadline or a Canvas calendar event. */
export interface CalendarEntry {
  key: string;
  title: string;
  start: Date;
  allDay: boolean;
  color: string;
  kind: 'work' | 'event' | 'announcement';
  done: boolean;
  url: string | null;
  /** What the reader opens; null opens Canvas. */
  item: ReaderItem | null;
}

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
    const [cursor, setCursor] = useState(() => new Date());
    const [selected, setSelected] = useState<Date | null>(null);
    const courseIds = useCourseIds(settings.courseIds);
    const openItem = useOpenItem();
    const timeFmt = useTimeFormat();
    // A month grid needs room; fall back to agenda in narrow widgets.
    const view = settings.view === 'month' && size.w < 4 ? 'agenda' : settings.view;
    const { start, end } = range(view, cursor, weekStartsOn, settings.agendaDays);

    const deadlines = useDeadlines(start, end);
    const events = useEvents(settings.showEvents ? courseIds : [], start, end);

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
            allDay: e.allDay,
            color: e.color,
            kind: 'event',
            done: false,
            url: e.url,
            item: fromEvent(e),
          });
        }
      }
      return out.sort((a, b) => a.start.getTime() - b.start.getTime());
    }, [
      deadlines.data,
      events.data,
      courseIds,
      settings.showAnnouncements,
      settings.showWork,
      settings.showEvents,
      settings.hideCompleted,
    ]);

    // Entries are already in time order.
    const onDay = (d: Date) => entries.filter((e) => isSameDay(e.start, d));
    // In month cells only a few chips fit, so unfinished work goes first and isn't hidden
    // behind "+N more".
    const inCell = (d: Date) =>
      onDay(d).sort(
        (a, b) => Number(a.done) - Number(b.done) || a.start.getTime() - b.start.getTime(),
      );
    const step = (dir: 1 | -1) => {
      setSelected(null);
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

    const EntryRow = ({ e }: { e: CalendarEntry }) => (
      <button
        type="button"
        onClick={() => openItem(e.item, e.url)}
        className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-2"
      >
        <span className="w-[4.25rem] shrink-0 whitespace-nowrap text-xs tabular-nums text-muted">
          {e.allDay ? 'All day' : format(e.start, timeFmt)}
        </span>
        <span
          aria-hidden
          className={`h-2.5 w-2.5 shrink-0 ${e.kind === 'event' ? 'rounded-sm' : 'rounded-full'}`}
          style={{ backgroundColor: e.color }}
        />
        <span className={`truncate ${e.done ? 'text-muted line-through' : ''}`}>{e.title}</span>
      </button>
    );

    const weekdays = eachDayOfInterval({
      start: startOfWeek(new Date(), { weekStartsOn }),
      end: endOfWeek(new Date(), { weekStartsOn }),
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
          <span className="flex-1 truncate font-semibold">{title}</span>
          <button
            type="button"
            className="btn btn-ghost px-2 py-0.5 text-xs"
            onClick={() => {
              setCursor(new Date());
              setSelected(null);
            }}
          >
            Today
          </button>
        </div>
        <QueryGate queries={[deadlines.query]}>
          {() => {
            if (view === 'month') {
              const days = eachDayOfInterval({ start, end });
              const picked = selected ? onDay(selected) : [];
              // How many 16px event chips fit under the day number in a cell of this widget size.
              const widgetPx = size.h * 36 + (size.h - 1) * 12;
              const cellPx = (widgetPx - 112 - (selected ? 90 : 0)) / (days.length / 7);
              const chipSlots =
                size.w >= 6 ? Math.max(0, Math.min(3, Math.floor((cellPx - 20) / 17))) : 0;
              return (
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                  <div className="grid grid-cols-7 text-center text-[10px] font-semibold uppercase text-muted">
                    {weekdays.map((d) => (
                      <div key={d.toISOString()}>{format(d, size.w >= 6 ? 'EEE' : 'EEEEE')}</div>
                    ))}
                  </div>
                  <div
                    className="grid flex-1 grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-border"
                    style={{ gridAutoRows: '1fr' }}
                  >
                    {days.map((d) => {
                      const list = inCell(d);
                      const isSel = selected && isSameDay(d, selected);
                      return (
                        <button
                          type="button"
                          key={d.toISOString()}
                          onClick={() => setSelected(isSel ? null : d)}
                          aria-label={`${format(d, 'EEEE d MMMM')}, ${list.length} item${list.length === 1 ? '' : 's'}`}
                          aria-pressed={Boolean(isSel)}
                          className={`flex min-h-0 flex-col items-stretch gap-0.5 overflow-hidden p-0.5 text-left ${isSameMonth(d, cursor) ? 'bg-surface' : 'bg-surface-2/60 text-muted'} ${isSel ? 'ring-2 ring-inset ring-accent' : ''}`}
                        >
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
                                    className={`truncate rounded px-1 text-[10px] leading-4 ${e.done ? 'opacity-50' : ''}`}
                                    style={{
                                      backgroundColor: `${e.color}22`,
                                      borderLeft: `2px solid ${e.color}`,
                                    }}
                                  >
                                    {e.title}
                                  </span>
                                ))
                            : null}
                          {chipSlots > 0 && list.length > chipSlots && (
                            <span className="px-1 text-[10px] leading-4 text-muted">
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
                  {selected && (
                    <div className="max-h-[40%] overflow-auto scroll-thin">
                      <div className="mb-1 text-xs font-semibold text-muted">
                        {format(selected, 'EEEE d MMMM')}
                      </div>
                      {picked.length ? (
                        picked.map((e) => <EntryRow key={e.key} e={e} />)
                      ) : (
                        <div className="text-xs text-muted">Nothing on this day.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            }
            const days = eachDayOfInterval({ start, end });
            const anything = days.some((d) => onDay(d).length > 0);
            if (!anything) return <EmptyState>Nothing scheduled.</EmptyState>;
            return (
              <div className="flex flex-col gap-2">
                {days.map((d) => {
                  const list = onDay(d);
                  if (view === 'agenda' && list.length === 0) return null;
                  return (
                    <section key={d.toISOString()} aria-label={format(d, 'EEEE d MMMM')}>
                      <h3
                        className={`text-[11px] font-semibold uppercase tracking-wide ${isToday(d) ? 'text-accent' : 'text-muted'}`}
                      >
                        {format(d, 'EEE d MMM')}
                        {isToday(d) && ' · Today'}
                      </h3>
                      {list.length ? (
                        list.map((e) => <EntryRow key={e.key} e={e} />)
                      ) : (
                        <div className="px-1 text-xs text-muted/70">—</div>
                      )}
                    </section>
                  );
                })}
              </div>
            );
          }}
        </QueryGate>
      </div>
    );
  },
});
