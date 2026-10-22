import { useMemo } from 'react';
import { useSettings } from '../app/settingsStore';
import { useCatalog } from '../canvas/hooks';
import type { LoadSource } from '../lib/load';
import { isRecord } from '../lib/storage';
import type { NotificationPrefs } from './prefs';
import { decideWeeklyPreview, type WeeklyState } from './rules/weekly';
import { ruleStorageKey, useNotifyDeadlines, useRuleRunner, type Rule } from './useRuleRunner';

// Runs beside useNotifications (mounted by NotificationRunner): every minute it asks
// decideWeeklyPreview whether the week-ahead preview is due. It reads the same cached planner
// window as the deadline reminders, so it makes no Canvas requests of its own. Its state is
// kept per Canvas account like theirs, under its own key.

const STORAGE_PREFIX = 'tarpaulin.notifications.weekly';
export const weeklyStorageKey = (scope: string) => ruleStorageKey(STORAGE_PREFIX, scope);

interface Input {
  deadlines: LoadSource[] | null;
  prefs: NotificationPrefs;
  now: Date;
  weekStartsOn: 0 | 1;
}

const RULE: Rule<Input, WeeklyState | null> = {
  prefix: STORAGE_PREFIX,
  parse: (raw) =>
    isRecord(raw) ? { lastWeek: typeof raw.lastWeek === 'string' ? raw.lastWeek : null } : null,
  // Nothing saved yet: the rule's first look for this account.
  empty: null,
  decide: ({ deadlines, prefs, now, weekStartsOn }, state) =>
    decideWeeklyPreview({ deadlines }, prefs, state, now, weekStartsOn),
};

export function useWeeklyPreview() {
  const prefs = useSettings((s) => s.notifications);
  const weekStartsOn = useSettings((s): 0 | 1 => (s.weekStartsOn === 'monday' ? 1 : 0));
  const catalog = useCatalog();
  const { now, deadlines } = useNotifyDeadlines();
  const courseIds = useMemo(() => catalog.resolveCourseIds([]), [catalog]);

  const items = useMemo<LoadSource[] | null>(
    () => (deadlines.query.data ? deadlines.data.inCourses(courseIds).toArray() : null),
    [deadlines, courseIds],
  );
  const input = useMemo(
    () => ({ deadlines: items, prefs, now, weekStartsOn }),
    [items, prefs, now, weekStartsOn],
  );
  useRuleRunner(RULE, input);
}
