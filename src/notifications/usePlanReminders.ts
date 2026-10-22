import { addDays, startOfDay } from 'date-fns';
import { useEffect, useMemo, useRef } from 'react';
import { showNotification } from '../app/desktop';
import { useSettings } from '../app/settingsStore';
import { useDeadlines, useNow } from '../canvas/hooks';
import { useTimeFormat } from '../lib/dates';
import { useAccountPlans, usePlanAccount } from '../planner/hooks';
import { planKeyForPlannerItem } from '../planner/keys';
import { usePlans } from '../planner/store';
import {
  EMPTY_PLAN_REMINDER_STATE,
  planPlanReminders,
  type PlanReminderInput,
  type PlanReminderState,
} from './planRules';

// Runs beside the other notifications (NotificationRunner): every minute it asks planRules which
// "Planned for today" reminders are due. Shown reminders are saved per account, like the rest.
// It also tells the plan store which planned items Canvas still lists, so their plans aren't
// pruned. It reads the same cached planner data the notifications hook does: no extra requests.

const STORAGE_PREFIX = 'tarpaulin.planReminders';
export const planReminderStorageKey = (account: string) => `${STORAGE_PREFIX}:${account}`;
const BACK_DAYS = 30;
const AHEAD_DAYS = 8;

function load(key: string): PlanReminderState {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as Partial<PlanReminderState>) : null;
    return parsed?.shown && typeof parsed.shown === 'object'
      ? { shown: parsed.shown }
      : EMPTY_PLAN_REMINDER_STATE;
  } catch {
    return EMPTY_PLAN_REMINDER_STATE;
  }
}
function save(key: string, state: PlanReminderState) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* storage unavailable: a reminder may repeat after a restart, nothing worse */
  }
}

export function usePlanReminders() {
  const prefs = useSettings((s) => s.notifications);
  const enabled = useSettings((s) => s.planReminders);
  const now = useNow(60_000);
  const timeFmt = useTimeFormat();
  const today = startOfDay(now);
  const account = usePlanAccount();
  const plans = useAccountPlans();
  const markSeen = usePlans((s) => s.markSeen);
  const deadlines = useDeadlines(addDays(today, -BACK_DAYS), addDays(today, AHEAD_DAYS));
  const state = useRef<{ key: string; value: PlanReminderState } | null>(null);

  // Canvas's view of each planned item: its current title, and whether it's handed in.
  const canvas = useMemo(() => {
    const byKey = new Map<string, { title: string; courseName: string; done: boolean }>();
    if (!deadlines.query.data) return null;
    for (const d of deadlines.data) {
      const key = planKeyForPlannerItem(d);
      if (key) byKey.set(key, { title: d.title, courseName: d.courseName, done: d.isDone });
    }
    return byKey;
  }, [deadlines]);

  const seen = useMemo(
    () => (canvas ? Object.keys(plans).filter((k) => canvas.has(k)) : []),
    [canvas, plans],
  );
  useEffect(() => {
    if (account && seen.length) markSeen(account, seen);
  }, [account, seen, markSeen]);

  const input = useMemo<PlanReminderInput[]>(
    () =>
      Object.entries(plans).flatMap(([key, p]) => {
        if (!p.doDate) return [];
        const live = canvas?.get(key);
        return [
          {
            key,
            title: live?.title ?? p.title,
            courseName: live?.courseName ?? p.courseName,
            doDate: p.doDate,
            done: p.status === 'done' || Boolean(live?.done),
          },
        ];
      }),
    [plans, canvas],
  );

  // Wait for Canvas, so work already handed in isn't announced (unless Canvas can't be reached).
  const ready = canvas !== null || deadlines.query.isError;

  useEffect(() => {
    if (!account || !ready) return;
    const key = planReminderStorageKey(account);
    if (state.current?.key !== key) state.current = { key, value: load(key) };
    const planned = planPlanReminders(input, { enabled, prefs }, state.current.value, now, timeFmt);
    state.current.value = planned.state;
    save(key, planned.state);
    for (const n of planned.notes) void showNotification(n.title, n.body).catch(() => {});
  }, [account, ready, input, enabled, prefs, now, timeFmt]);
}
