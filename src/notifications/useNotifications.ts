import { useMemo } from 'react';
import { useSettings } from '../app/settingsStore';
import { useAnnouncements, useCatalog } from '../canvas/hooks';
import { useTimeFormat } from '../lib/dates';
import { isRecord } from '../lib/storage';
import type { NotificationPrefs } from './prefs';
import {
  EMPTY_STATE,
  decideNotifications,
  type NotifyInput,
  type NotifyState,
} from './rules/deadlines';
import { usePlanReminders } from './usePlanReminders';
import { ruleStorageKey, useNotifyDeadlines, useRuleRunner, type Rule } from './useRuleRunner';
import { useWeeklyPreview } from './useWeeklyPreview';

// Runs in the background while the app is open: every minute, and whenever Canvas data
// refreshes, it asks the rules which notifications are due and shows them. It reads the same
// cached queries the widgets use (the shared planner window, the announcements widget's default
// range), so it adds no Canvas requests of its own.

// What's been shown is kept per Canvas account, so signing in to another account doesn't count
// all of its recent announcements as new (each account gets its own quiet first look).
const STORAGE_PREFIX = 'tarpaulin.notifications';
/** Before accounts had their own state: adopted by the first account that runs. */
const LEGACY_KEY = STORAGE_PREFIX;
export const notifyStorageKey = (scope: string) => ruleStorageKey(STORAGE_PREFIX, scope);
const ANNOUNCEMENT_DAYS = 14;

interface Input {
  data: NotifyInput;
  prefs: NotificationPrefs;
  now: Date;
  timeFmt: string;
}

const RULE: Rule<Input, NotifyState> = {
  prefix: STORAGE_PREFIX,
  parse: (raw) => (isRecord(raw) ? { ...EMPTY_STATE, ...(raw as Partial<NotifyState>) } : null),
  empty: EMPTY_STATE,
  decide: ({ data, prefs, now, timeFmt }, state) =>
    decideNotifications(data, prefs, state, now, timeFmt),
  migrate: (key) => {
    try {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy === null || localStorage.getItem(key) !== null) return;
      localStorage.setItem(key, legacy);
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* storage unavailable: nothing to move */
    }
  },
};

export function useNotifications() {
  const prefs = useSettings((s) => s.notifications);
  const catalog = useCatalog();
  const timeFmt = useTimeFormat();
  const { now, deadlines } = useNotifyDeadlines();
  const courseIds = useMemo(() => catalog.resolveCourseIds([]), [catalog]);
  const announcements = useAnnouncements(courseIds, ANNOUNCEMENT_DAYS);

  const data = useMemo<NotifyInput>(() => {
    // Only hand over data that has loaded, so a half-loaded first look never becomes the
    // baseline (and nothing is mistaken for "new" when the rest arrives).
    const work = deadlines.query.data ? deadlines.data.work().inCourses(courseIds) : null;
    return {
      deadlines:
        work?.dated().map((d) => ({
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

  const input = useMemo(() => ({ data, prefs, now, timeFmt }), [data, prefs, now, timeFmt]);
  useRuleRunner(RULE, input);
}

/** Mount point: renders nothing. */
export function NotificationRunner() {
  useNotifications();
  useWeeklyPreview();
  usePlanReminders();
  return null;
}
