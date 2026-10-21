import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { addDays, formatISO, parseISO, startOfDay } from 'date-fns';
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSettings } from '../app/settingsStore';
import { useCanvas } from './CanvasProvider';
import {
  Catalog,
  type Announcements,
  type CalendarEvents,
  type Deadlines,
  type TodoItems,
} from './models';
import type { Resource } from './resource';
import * as R from './resources';

const day = (d: Date) => formatISO(d, { representation: 'date' });

/** Loads any Resource, keyed by account so switching accounts never shows stale data. */
export function useResource<T>(resource: Resource<T>): UseQueryResult<T> {
  const { client } = useCanvas();
  const refreshMinutes = useSettings((s) => s.refreshMinutes);
  return useQuery({
    queryKey: ['canvas', client?.baseUrl, ...resource.key],
    queryFn: () => client!.fetch(resource),
    enabled: Boolean(client) && resource.enabled,
    // Data counts as fresh for the whole refresh interval, so focusing the window or mounting
    // another widget reuses the cache instead of re-requesting.
    refetchInterval: refreshMinutes * 60_000,
    staleTime: refreshMinutes * 60_000,
  });
}

/** Model data plus the query (for loading/error states). */
export interface Loaded<T> {
  data: T;
  query: LoadStatus;
}

export const useProfile = () => useResource(R.Profile);

export interface LoadStatus {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  data?: unknown;
}

const CatalogContext = createContext<{ catalog: Catalog; status: LoadStatus } | null>(null);

/** Builds the Catalog once for the whole app: courses + colours + grades + the user's preferences. */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const courses = useResource(R.Courses);
  const colors = useResource(R.CourseColors);
  const enrollments = useResource(R.Enrollments);
  const { courseScope, hiddenCourseIds, courseColors, courseNicknames } = useSettings();
  const catalog = useMemo(
    () =>
      new Catalog({
        courses: courses.data ?? [],
        enrollments: enrollments.data,
        canvasColors: colors.data,
        prefs: { courseScope, hiddenCourseIds, courseColors, courseNicknames },
      }),
    [
      courses.data,
      enrollments.data,
      colors.data,
      courseScope,
      hiddenCourseIds,
      courseColors,
      courseNicknames,
    ],
  );
  const value = useMemo(
    () => ({
      catalog,
      status: {
        isLoading: courses.isLoading,
        isError: courses.isError,
        error: courses.error,
        data: courses.data,
      },
    }),
    [catalog, courses.isLoading, courses.isError, courses.error, courses.data],
  );
  return createElement(CatalogContext.Provider, { value }, children);
}

export function useCatalog(): Catalog {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used inside <CatalogProvider>');
  return ctx.catalog;
}

/** Loading/error state of the course list, for QueryGate. */
export function useCatalogStatus(): LoadStatus {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalogStatus must be used inside <CatalogProvider>');
  return ctx.status;
}

/** The widget's course filter applied on top of the global scope. */
export function useCourseIds(selected: string[]): string[] {
  const catalog = useCatalog();
  return useMemo(() => catalog.resolveCourseIds(selected), [catalog, selected]);
}

/**
 * Every planner-based widget reads from one shared window, so a dashboard makes a single planner
 * request; widgets slice it locally. Ranges outside it (e.g. paging the calendar) fetch their own.
 */
export const SHARED_PLANNER_WINDOW = { daysBack: 30, daysAhead: 90 } as const;

function sharedWindow(today: Date) {
  return {
    start: addDays(today, -SHARED_PLANNER_WINDOW.daysBack),
    end: addDays(today, SHARED_PLANNER_WINDOW.daysAhead),
  };
}

/** Planner items between two days (inclusive). */
export function useDeadlines(start: Date, end: Date): Loaded<Deadlines> {
  const catalog = useCatalog();
  const today = startOfDay(useNow(30 * 60_000));
  const shared = sharedWindow(today);
  const from = day(startOfDay(start));
  const to = day(startOfDay(addDays(end, 1)));
  const inShared = from >= day(shared.start) && to <= day(addDays(shared.end, 1));
  const query = useResource(
    inShared ? R.Planner(day(shared.start), day(addDays(shared.end, 1))) : R.Planner(from, to),
  );
  const data = useMemo(() => {
    const all = catalog.deadlines(query.data ?? []);
    if (!inShared) return all;
    // Trim the shared window to what was asked for; undated items (planner notes) pass through.
    const [lo, hi] = [startOfDay(parseISO(from)), startOfDay(parseISO(to))];
    return all.filter((d) => !d.date || (d.date >= lo && d.date < hi));
  }, [catalog, query.data, inShared, from, to]);
  return { data, query };
}

/** Deadlines from `daysBack` ago to `daysAhead` from today. */
export function useUpcoming(daysAhead: number, daysBack = 0): Loaded<Deadlines> {
  const today = startOfDay(useNow(30 * 60_000));
  return useDeadlines(addDays(today, -daysBack), addDays(today, daysAhead));
}

export function useAnnouncements(courseIds: string[], days: number): Loaded<Announcements> {
  const catalog = useCatalog();
  const today = startOfDay(new Date());
  const query = useResource(
    R.Announcements(courseIds, day(addDays(today, -days)), day(addDays(today, 1))),
  );
  const data = useMemo(() => catalog.announcements(query.data ?? []), [catalog, query.data]);
  return { data, query };
}

/** Calendar events for the given courses plus the user's personal calendar. */
export function useEvents(courseIds: string[], start: Date, end: Date): Loaded<CalendarEvents> {
  const catalog = useCatalog();
  const profile = useProfile();
  const codes = courseIds.map((id) => `course_${id}`);
  if (profile.data) codes.push(`user_${profile.data.id}`);
  const resource = R.CalendarEvents(
    codes,
    day(startOfDay(start)),
    day(startOfDay(addDays(end, 1))),
  );
  // Wait for the profile and course list so the first request already has every context code,
  // instead of fetching once with a partial list and again with the full one.
  const status = useCatalogStatus();
  const ready = (profile.data !== undefined || profile.isError) && !status.isLoading;
  const query = useResource({ ...resource, enabled: resource.enabled && ready });
  const data = useMemo(() => catalog.events(query.data ?? []), [catalog, query.data]);
  return { data, query };
}

export function useTodos(): Loaded<TodoItems> {
  const catalog = useCatalog();
  const query = useResource(R.Todo);
  const data = useMemo(() => catalog.todos(query.data ?? []), [catalog, query.data]);
  return { data, query };
}

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
