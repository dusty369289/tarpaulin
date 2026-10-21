import { addDays, startOfDay } from 'date-fns';
import { useEffect, useMemo, useRef } from 'react';
import { showNotification } from '../app/desktop';
import { useSettings } from '../app/settingsStore';
import { useAnnouncements, useCatalog, useDeadlines, useNow } from '../canvas/hooks';
import { useTimeFormat } from '../lib/dates';
import { EMPTY_STATE, planNotifications, type NotifyInput, type NotifyState } from './rules';

// Runs in the background while the app is open: every minute, and whenever Canvas data
// refreshes, it asks the rules which notifications are due and shows them. It reads the same
// cached queries the widgets use (the shared planner window, the announcements widget's default
// range), so it adds no Canvas requests of its own.

const STORAGE_KEY = 'tarpaulin.notifications';
/** Longest reminder lead is a week; graded work is looked at back to the planner window start. */
const AHEAD_DAYS = 8;
const BACK_DAYS = 30;
const ANNOUNCEMENT_DAYS = 14;

function load(): NotifyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY_STATE, ...(JSON.parse(raw) as NotifyState) } : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}
function save(state: NotifyState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: reminders may repeat after a restart, nothing worse */
  }
}

export function useNotifications() {
  const prefs = useSettings((s) => s.notifications);
  const catalog = useCatalog();
  const now = useNow(60_000);
  const timeFmt = useTimeFormat();
  const today = startOfDay(now);
  const courseIds = useMemo(() => catalog.resolveCourseIds([]), [catalog]);
  const deadlines = useDeadlines(addDays(today, -BACK_DAYS), addDays(today, AHEAD_DAYS));
  const announcements = useAnnouncements(courseIds, ANNOUNCEMENT_DAYS);
  const state = useRef<NotifyState | null>(null);

  const input = useMemo<NotifyInput>(() => {
    // Only hand over data that has loaded, so a half-loaded first look never becomes the
    // baseline (and nothing is mistaken for "new" when the rest arrives).
    const inScope = (d: { courseId: string | null }) =>
      !d.courseId || courseIds.includes(d.courseId);
    const work = deadlines.query.data ? deadlines.data.work().filter(inScope) : null;
    return {
      deadlines:
        work
          ?.filter((d) => d.date !== null)
          .map((d) => ({
            key: d.key,
            title: d.title,
            courseName: d.courseName,
            dueAt: d.date!,
            done: d.isDone,
          })) ?? null,
      graded:
        work
          ?.filter((d) => d.data.graded)
          .map((d) => ({
            key: d.key,
            title: d.title,
            courseName: d.courseName,
          })) ?? null,
      announcements: announcements.query.data
        ? announcements.data.map((a) => ({
            id: a.id,
            title: a.title,
            courseName: a.courseName,
            postedAt: a.postedAt,
          }))
        : null,
      scores: catalog.inScope.length
        ? catalog.inScope.map((c) => ({ courseId: c.id, courseName: c.name, score: c.grade.score }))
        : null,
    };
  }, [deadlines, announcements, catalog, courseIds]);

  useEffect(() => {
    state.current ??= load();
    const { notes, state: next } = planNotifications(input, prefs, state.current, now, timeFmt);
    state.current = next;
    save(next);
    for (const n of notes) void showNotification(n.title, n.body).catch(() => {});
  }, [input, prefs, now, timeFmt]);
}

/** Mount point: renders nothing. */
export function NotificationRunner() {
  useNotifications();
  return null;
}
