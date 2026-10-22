import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { addDays, parseISO, startOfDay } from 'date-fns';
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettings } from '../app/settingsStore';
import { dayKey as day, inZone, nowInZone, setDisplayZone, useDisplayZone } from '../lib/dates';
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

/** The query key of a resource: `['canvas', <baseUrl>, ...resource.key]`. */
export const canvasQueryKey = (baseUrl: string | undefined, key: readonly unknown[]) => [
  'canvas',
  baseUrl,
  ...key,
];

/** Loads any Resource, keyed by account so switching accounts never shows stale data. */
export function useResource<T>(resource: Resource<T>): UseQueryResult<T> {
  const { client } = useCanvas();
  const refreshMinutes = useSettings((s) => s.refreshMinutes);
  // Data counts as fresh for the whole refresh interval (or the resource's own, longer one for
  // things that rarely change), so focusing the window or mounting another widget reuses the
  // cache instead of re-requesting.
  const fresh = resource.staleTime ?? refreshMinutes * 60_000;
  return useQuery({
    queryKey: canvasQueryKey(client?.baseUrl, resource.key),
    queryFn: () => client!.fetch(resource),
    enabled: Boolean(client) && resource.enabled,
    refetchInterval: fresh,
    // Keep refreshing while the window is hidden in the tray, so new announcements and grades
    // still reach the notification runner.
    refetchIntervalInBackground: true,
    staleTime: fresh,
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
  isFetching?: boolean;
  /** Fetches again (QueryGate's Retry). Every useQuery result has one. */
  refetch?: () => unknown;
}

const CatalogContext = createContext<{ catalog: Catalog; status: LoadStatus } | null>(null);

/** Builds the Catalog once for the whole app: courses + colours + grades + the user's preferences. */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const courses = useResource(R.Courses);
  const colors = useResource(R.CourseColors);
  const enrollments = useResource(R.Enrollments);
  const { courseScope, hiddenCourseIds, courseColors, courseNicknames } = useSettings(
    useShallow((s) => ({
      courseScope: s.courseScope,
      hiddenCourseIds: s.hiddenCourseIds,
      courseColors: s.courseColors,
      courseNicknames: s.courseNicknames,
    })),
  );
  // Which time zone times are shown in (see lib/dates.ts). The catalog is rebuilt when it
  // changes, since every model reads its times through toDate.
  const timesIn = useSettings((s) => s.timesIn);
  const canvasZone = useProfile().data?.timeZone ?? null;
  useLayoutEffect(() => {
    setDisplayZone(timesIn === 'canvas' ? canvasZone : null);
  }, [timesIn, canvasZone]);
  const zone = useDisplayZone();
  const catalog = useMemo(
    () =>
      new Catalog({
        courses: courses.data ?? [],
        enrollments: enrollments.data,
        canvasColors: colors.data,
        prefs: { courseScope, hiddenCourseIds, courseColors, courseNicknames },
        // The models read the zone through toDate; it's in the dependencies for them.
        now: zone ? inZone(new Date(), zone) : new Date(),
      }),
    [
      zone,
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
        isFetching: courses.isFetching,
        refetch: courses.refetch,
      },
    }),
    [
      catalog,
      courses.isLoading,
      courses.isError,
      courses.error,
      courses.data,
      courses.isFetching,
      courses.refetch,
    ],
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
  const today = startOfDay(nowInZone());
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

/**
 * Every query of one Canvas list already in the cache, whatever its range, by the first part of
 * its resource key ('planner', 'calendar', 'todo', 'missing'…): the calendar's other months, the
 * to-do list, missing work. Read only: it never makes a request, so Quick find shows what the
 * widgets have loaded and adds nothing to what the app asks Canvas for.
 */
export function useCachedResource<T>(kind: string): T[] {
  const queryClient = useQueryClient();
  const baseUrl = useCanvas().client?.baseUrl;
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((e) => {
        if (e.type === 'updated' && e.query.queryKey[2] === kind) bump();
      }),
    [queryClient, kind],
  );
  return useMemo(() => {
    void version;
    return queryClient
      .getQueryCache()
      .findAll({ queryKey: canvasQueryKey(baseUrl, [kind]) })
      .flatMap((q) => (Array.isArray(q.state.data) ? (q.state.data as T[]) : []));
  }, [queryClient, baseUrl, kind, version]);
}

/** The current time, in the zone times are shown in (see lib/dates.ts). */
export function useNow(intervalMs = 1000): Date {
  const zone = useDisplayZone();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return useMemo(() => (zone ? inZone(now, zone) : now), [now, zone]);
}
