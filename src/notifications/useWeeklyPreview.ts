import { addDays, startOfDay } from 'date-fns';
import { useEffect, useMemo, useRef } from 'react';
import { showNotification } from '../app/desktop';
import { useSettings } from '../app/settingsStore';
import { useCanvas } from '../canvas/CanvasProvider';
import { useCatalog, useDeadlines, useNow, useProfile } from '../canvas/hooks';
import type { LoadSource } from '../lib/load';
import { planWeeklyPreview, type WeeklyState } from './weekly';

// Runs beside useNotifications (mounted by NotificationRunner): every minute it asks
// planWeeklyPreview whether the week-ahead preview is due. It reads the same cached planner
// window as the deadline reminders, so it makes no Canvas requests of its own. Its state is
// kept per Canvas account like theirs, under its own key.

export const weeklyStorageKey = (baseUrl: string, userId: string) =>
  `tarpaulin.notifications.weekly:${baseUrl}|${userId}`;
/** The same window useNotifications reads (back for course baselines, ahead past next week). */
const AHEAD_DAYS = 8;
const BACK_DAYS = 30;

function load(key: string): WeeklyState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<WeeklyState>;
    return { lastWeek: typeof v.lastWeek === 'string' ? v.lastWeek : null };
  } catch {
    return null;
  }
}
function save(key: string, state: WeeklyState) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* storage unavailable: at worst the preview shows again after a restart */
  }
}

export function useWeeklyPreview() {
  const prefs = useSettings((s) => s.notifications);
  const enabled = prefs.weekly;
  const weekStartsOn = useSettings((s) => (s.weekStartsOn === 'monday' ? 1 : 0));
  const catalog = useCatalog();
  const now = useNow(60_000);
  const today = startOfDay(now);
  const courseIds = useMemo(() => catalog.resolveCourseIds([]), [catalog]);
  const deadlines = useDeadlines(addDays(today, -BACK_DAYS), addDays(today, AHEAD_DAYS));
  const baseUrl = useCanvas().client?.baseUrl;
  const profile = useProfile();
  const userId = profile.data?.id ?? (profile.isError ? '' : null);
  const key = baseUrl && userId !== null ? weeklyStorageKey(baseUrl, userId) : null;
  const state = useRef<{ key: string; value: WeeklyState | null } | null>(null);

  const items = useMemo<LoadSource[] | null>(() => {
    if (!deadlines.query.data) return null;
    return deadlines.data.filter((d) => !d.courseId || courseIds.includes(d.courseId)).toArray();
  }, [deadlines, courseIds]);

  useEffect(() => {
    if (!key) return;
    if (state.current?.key !== key) state.current = { key, value: load(key) };
    const planned = planWeeklyPreview(
      { deadlines: items },
      prefs,
      enabled,
      state.current.value,
      now,
      weekStartsOn,
    );
    if (planned.state !== state.current.value) {
      state.current.value = planned.state;
      save(key, planned.state);
    }
    if (planned.note) void showNotification(planned.note.title, planned.note.body).catch(() => {});
  }, [key, items, prefs, enabled, now, weekStartsOn]);
}
