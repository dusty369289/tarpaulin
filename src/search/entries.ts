import { useQueryClient } from '@tanstack/react-query';
import { addDays, endOfDay, format } from 'date-fns';
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileText,
  GraduationCap,
  ListChecks,
  ListTodo,
  Megaphone,
  MessagesSquare,
  Moon,
  RefreshCw,
  Settings,
  StickyNote,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useReducer } from 'react';
import { useSettings } from '../app/settingsStore';
import { useCanvas } from '../canvas/CanvasProvider';
import {
  SHARED_PLANNER_WINDOW,
  useAnnouncements,
  useCatalog,
  useNow,
  useUpcoming,
} from '../canvas/hooks';
import type { Deadline } from '../canvas/models';
import type {
  AnnouncementData,
  AssignmentData,
  CalendarEventData,
  PlannerItemData,
  TodoData,
} from '../canvas/types';
import { formatDayTime, relative, toDate, useTimeFormat } from '../lib/dates';
import {
  fromAnnouncement,
  fromDeadline,
  fromEvent,
  fromTodo,
  type ReaderItem,
} from '../reader/items';
import { useOpenItem } from '../reader/ReaderProvider';
import { useResolvedTheme } from '../theme/mode';
import type { Searchable } from './match';
import { SETTINGS_ENTRIES } from './settingsEntries';
import { useQuickFind } from './store';

export type GroupId = 'due' | 'announcements' | 'events' | 'courses' | 'pages' | 'actions';

export const GROUP_LABELS: Record<GroupId | 'recent' | 'dueSoon', string> = {
  recent: 'Recent',
  /** With nothing typed, the work group lists only what's due in the next few days. */
  dueSoon: 'Due soon',
  due: 'Work',
  announcements: 'Announcements',
  events: 'Events',
  courses: 'Courses',
  pages: 'Pages',
  actions: 'Actions',
};

/** Fixed order of the groups, used when they match equally well. */
export const GROUP_ORDER: GroupId[] = [
  'due',
  'announcements',
  'events',
  'courses',
  'pages',
  'actions',
];

/** One thing Quick find can show and open. */
export interface SearchEntry extends Searchable {
  /** Stable across sessions (recent picks keep it). */
  id: string;
  group: GroupId;
  /** The muted line: "Due tomorrow 23:59 · Machine Learning". */
  detail: string;
  icon: LucideIcon;
  /** What kind of thing it is, for screen readers ("Assignment"). */
  kind: string;
  /** Course colour, when it belongs to a course. */
  color?: string;
  /** Where Ctrl/⌘+Enter opens it in Canvas, if it's there. */
  canvasUrl?: string | null;
  /** Enter. */
  open: () => void;
  /** Undone work, for the "due in the next few days" list. */
  pending?: boolean;
}

export interface EntryActions {
  /** Shows Settings; `section` is for the category deep links to come (see settingsEntries). */
  onOpenSettings: (section?: string) => void;
  /** Brings the dashboard back if Settings is showing. */
  onShowDashboard: () => void;
}

const PLANNER_KIND: Record<PlannerItemData['type'], [string, LucideIcon]> = {
  assignment: ['Assignment', FileText],
  quiz: ['Quiz', ListChecks],
  discussion_topic: ['Discussion', MessagesSquare],
  announcement: ['Announcement', Megaphone],
  wiki_page: ['Page', BookOpen],
  planner_note: ['Note', StickyNote],
  calendar_event: ['Event', CalendarDays],
  assessment_request: ['Peer review', ClipboardCheck],
  other: ['Item', FileText],
};

const STATUS_LABEL: Partial<Record<ReturnType<Deadline['status']>, string>> = {
  excused: 'Excused',
  graded: 'Graded',
  submitted: 'Submitted',
  'submitted-late': 'Submitted late',
  done: 'Done',
  missing: 'Missing',
  overdue: 'Overdue',
};

/** "Due tomorrow 23:59", "Due Fri 12:00", "Due 12 Nov"; without a prefix, "Tomorrow 23:59". */
function dueText(date: Date, now: Date, timeFmt: string, prefix = 'Due'): string {
  return prefix
    ? `${prefix} ${formatDayTime(date, now, timeFmt, { lower: true })}`
    : formatDayTime(date, now, timeFmt);
}

const joinDetail = (...parts: Array<string | null | undefined | false>) =>
  parts.filter(Boolean).join(' · ');

/**
 * Every query of one Canvas list already in the cache, whatever its range: the calendar's other
 * months, the to-do list, missing work. Read only: it never makes a request, so Quick find shows
 * what the widgets have loaded and adds nothing to what the app asks Canvas for.
 */
function useCachedLists<T>(kind: string): T[] {
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
      .findAll({ queryKey: ['canvas', baseUrl, kind] })
      .flatMap((q) => (Array.isArray(q.state.data) ? (q.state.data as T[]) : []));
  }, [queryClient, baseUrl, kind, version]);
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = key(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Everything Quick find can find, from data the app already has. */
export function useSearchEntries(actions: EntryActions): { entries: SearchEntry[]; now: Date } {
  const catalog = useCatalog();
  const now = useNow(60_000);
  const timeFmt = useTimeFormat();
  const openItem = useOpenItem();
  const { openLink } = useCanvas();
  const queryClient = useQueryClient();
  const scopeIds = useMemo(() => catalog.resolveCourseIds([]), [catalog]);

  // The shared planner window and the announcements' default range: the same queries the
  // widgets and the reminder runner already keep loaded (so no new requests), plus whatever
  // other ranges are cached.
  const upcoming = useUpcoming(SHARED_PLANNER_WINDOW.daysAhead, SHARED_PLANNER_WINDOW.daysBack);
  const recentNews = useAnnouncements(scopeIds, 14);
  const plannerCached = useCachedLists<PlannerItemData>('planner');
  const announcementsCached = useCachedLists<AnnouncementData>('announcements');
  const eventsCached = useCachedLists<CalendarEventData>('calendar');
  const todosCached = useCachedLists<TodoData>('todo');
  const missingCached = useCachedLists<AssignmentData>('missing');

  const commands = useQuickFind((s) => s.commands);
  const theme = useResolvedTheme();

  const entries = useMemo(() => {
    const scope = new Set(scopeIds);
    const inScope = (courseId: string | null) => !courseId || scope.has(courseId);
    const courseWords = (courseId: string | null, fallback = '') => {
      const c = catalog.course(courseId);
      return c ? [c.name, c.canvasName, c.code] : fallback ? [fallback] : [];
    };
    const reader = (item: ReaderItem | null, url: string | null | undefined) => () =>
      openItem(item, url);
    const out: SearchEntry[] = [];

    // Planner items: work, pages and notes go under Due soon; announcements and events join
    // their own groups (and give way to the fuller copies from their own lists).
    const deadlines = catalog
      .deadlines(uniqueBy([...upcoming.data.map((d) => d.data), ...plannerCached], (d) => d.key))
      .filter((d) => inScope(d.courseId));
    const announcements = catalog
      .announcements(
        uniqueBy([...recentNews.data.map((a) => a.data), ...announcementsCached], (a) => a.id),
      )
      .filter((a) => inScope(a.courseId));
    const events = catalog
      .events(uniqueBy(eventsCached, (e) => e.id))
      .filter((e) => inScope(e.courseId));
    const announcementIds = new Set(announcements.map((a) => a.id));
    const eventIds = new Set(events.map((e) => e.id));
    // Work the planner already has, so to-dos and missing work don't show it twice.
    const plannerWork = new Set<string>();
    // Canvas can link a graded discussion's to-do to its assignment but its planner item to the
    // topic, so the same work is also recognised by course, title and due time.
    const sameWork = (courseId: string | null, title: string, due: string | null) =>
      `same:${courseId}|${title}|${due ? Date.parse(due) : ''}`;

    for (const d of deadlines) {
      const [kind, icon] = PLANNER_KIND[d.type];
      if (d.isAnnouncement && announcementIds.has(d.data.id)) continue;
      if (d.isEvent && eventIds.has(d.data.id)) continue;
      if (d.type === 'assignment') plannerWork.add(`assignment:${d.data.id}`);
      if (d.type === 'quiz') plannerWork.add(`quiz:${d.data.id}`);
      if (d.data.assignmentId) plannerWork.add(`assignment:${d.data.assignmentId}`);
      if (d.isWork) plannerWork.add(sameWork(d.courseId, d.title, d.data.dueAt));
      const group: GroupId = d.isAnnouncement ? 'announcements' : d.isEvent ? 'events' : 'due';
      const when = d.date
        ? d.isWork
          ? dueText(d.date, now, timeFmt)
          : dueText(d.date, now, timeFmt, '')
        : null;
      out.push({
        id: `planner:${d.key}`,
        group,
        title: d.title,
        context: courseWords(d.courseId, d.courseName),
        keywords: [kind],
        due: d.date,
        detail: joinDetail(when, STATUS_LABEL[d.status(now)], d.courseName),
        icon,
        kind,
        color: d.course || d.courseId ? d.color : undefined,
        canvasUrl: d.url,
        open: reader(fromDeadline(d), d.url),
        pending: d.isWork && !d.isDone,
      });
    }

    for (const t of catalog.todos(uniqueBy(todosCached, (t) => t.key))) {
      if (!inScope(t.courseId)) continue;
      const a = t.data.assignmentId;
      const q = t.data.quizId;
      if (
        (a && plannerWork.has(`assignment:${a}`)) ||
        (q && plannerWork.has(`quiz:${q}`)) ||
        plannerWork.has(sameWork(t.courseId, t.title, t.data.dueAt))
      )
        continue;
      out.push({
        id: `todo:${t.key}`,
        group: 'due',
        title: t.title,
        context: courseWords(t.courseId, t.courseName),
        keywords: ['To do'],
        due: t.dueAt,
        detail: joinDetail(t.dueAt ? dueText(t.dueAt, now, timeFmt) : 'To do', t.courseName),
        icon: ListTodo,
        kind: 'To do',
        color: t.courseId ? t.color : undefined,
        canvasUrl: t.url,
        open: reader(fromTodo(t), t.url),
        pending: t.data.kind === 'submitting',
      });
    }

    for (const m of uniqueBy(missingCached, (m) => m.id)) {
      if (
        !inScope(m.courseId) ||
        plannerWork.has(`assignment:${m.id}`) ||
        plannerWork.has(sameWork(m.courseId, m.name, m.dueAt))
      )
        continue;
      const course = catalog.course(m.courseId);
      const dueAt = toDate(m.dueAt);
      const item: ReaderItem | null = m.courseId
        ? {
            kind: 'assignment',
            courseId: m.courseId,
            id: m.id,
            title: m.name,
            courseName: course?.name ?? '',
            color: catalog.colorOf(m.courseId),
            url: m.htmlUrl,
            inline: { dueAt: m.dueAt, pointsPossible: m.pointsPossible },
          }
        : null;
      out.push({
        id: `missing:${m.id}`,
        group: 'due',
        title: m.name,
        context: courseWords(m.courseId),
        keywords: ['Missing'],
        due: dueAt,
        detail: joinDetail(dueAt && dueText(dueAt, now, timeFmt), 'Missing', course?.name),
        icon: AlertCircle,
        kind: 'Missing work',
        color: m.courseId ? catalog.colorOf(m.courseId) : undefined,
        canvasUrl: m.htmlUrl,
        open: reader(item, m.htmlUrl),
        pending: true,
      });
    }

    for (const a of announcements) {
      out.push({
        id: `announcement:${a.id}`,
        group: 'announcements',
        title: a.title,
        context: courseWords(a.courseId),
        keywords: [a.author, 'Announcement'],
        detail: joinDetail(a.postedAt && `Posted ${relative(a.postedAt, now)}`, a.courseName),
        icon: Megaphone,
        kind: 'Announcement',
        color: a.courseId ? a.color : undefined,
        canvasUrl: a.url,
        open: reader(fromAnnouncement(a), a.url),
      });
    }

    for (const e of events) {
      const courseName = e.course?.name ?? e.data.contextName;
      const when = e.start
        ? e.allDay
          ? format(e.start, 'EEE d MMM')
          : dueText(e.start, now, timeFmt, '')
        : null;
      out.push({
        id: `event:${e.id}`,
        group: 'events',
        title: e.title,
        context: courseWords(e.courseId, courseName),
        keywords: [e.location ?? '', 'Event'],
        due: e.start,
        detail: joinDetail(when, e.location, courseName),
        icon: CalendarDays,
        kind: 'Event',
        color: e.courseId ? e.color : undefined,
        canvasUrl: e.url,
        open: reader(fromEvent(e), e.url),
      });
    }

    for (const c of catalog.scoped.filter((c) => !c.isHidden).byName()) {
      out.push({
        id: `course:${c.id}`,
        group: 'courses',
        title: c.name,
        keywords: [c.canvasName, c.code, c.term?.name ?? '', 'Course'],
        secondary: true,
        detail: joinDetail(
          c.code !== c.name && c.code,
          c.name !== c.canvasName && c.canvasName,
          c.term?.name,
        ),
        icon: GraduationCap,
        kind: 'Course',
        color: c.color,
        canvasUrl: c.url,
        // Courses have no reader view: they open in Canvas.
        open: () => openLink(c.url),
      });
    }

    // Actions: the ones the showing screen registered (Edit layout, Add widget), then the
    // app-wide ones, each calling the same code as its button elsewhere.
    // Pages come the same way (registered by <QuickFind>, which owns the dashboard store), so
    // this module stays free of the dashboard and the Search widget can live in the registry.
    for (const cmd of Object.values(commands).flat()) {
      const group = cmd.group ?? 'actions';
      const kind = group === 'pages' ? 'Page' : 'Action';
      out.push({
        id: `${group === 'pages' ? 'page' : 'action'}:${cmd.id}`,
        group,
        title: cmd.title,
        keywords: [...(cmd.keywords ?? []), kind],
        detail: cmd.detail ?? '',
        icon: cmd.icon,
        kind,
        open: cmd.run,
      });
    }
    out.push({
      id: 'action:refresh',
      group: 'actions',
      title: 'Refresh from Canvas',
      keywords: ['reload', 'sync', 'update', 'Action'],
      detail: 'Fetch the latest from Canvas now',
      icon: RefreshCw,
      kind: 'Action',
      // As the top bar's Refresh button does.
      open: () => void queryClient.invalidateQueries({ queryKey: ['canvas'] }),
    });
    for (const s of SETTINGS_ENTRIES) {
      out.push({
        id: `action:${s.id}`,
        group: 'actions',
        title: s.title,
        keywords: [...(s.keywords ?? []), 'Settings'],
        detail: s.detail ?? '',
        icon: Settings,
        kind: 'Settings',
        open: () => actions.onOpenSettings(s.section),
      });
    }
    const toDark = theme === 'light';
    out.push({
      id: 'action:toggle-mode',
      group: 'actions',
      title: toDark ? 'Switch to dark mode' : 'Switch to light mode',
      keywords: ['theme', 'appearance', 'light', 'dark', 'night', 'mode', 'Action'],
      detail: 'Settings › Appearance › Mode',
      icon: toDark ? Moon : Sun,
      kind: 'Action',
      // The same setting the Settings page's Mode picker changes.
      open: () => useSettings.getState().update({ theme: toDark ? 'dark' : 'light' }),
    });
    return out;
  }, [
    catalog,
    scopeIds,
    upcoming.data,
    plannerCached,
    recentNews.data,
    announcementsCached,
    eventsCached,
    todosCached,
    missingCached,
    commands,
    theme,
    now,
    timeFmt,
    openItem,
    openLink,
    queryClient,
    actions,
  ]);

  return { entries, now };
}

/** Undone work due from now to the end of the day `days` ahead, soonest first. */
export function dueInNextDays(entries: SearchEntry[], now: Date, days = 3): SearchEntry[] {
  const until = endOfDay(addDays(now, days));
  return entries
    .filter((e) => e.group === 'due' && e.pending && e.due && e.due >= now && e.due <= until)
    .sort((a, b) => a.due!.getTime() - b.due!.getTime());
}
