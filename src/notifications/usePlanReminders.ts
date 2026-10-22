import { useEffect, useMemo } from 'react';
import { useSettings } from '../app/settingsStore';
import { useAccountScope } from '../canvas/account';
import { useTimeFormat } from '../lib/dates';
import { isRecord } from '../lib/storage';
import { useAccountPlans } from '../planner/hooks';
import { indexByPlanKey } from '../planner/selectors';
import { usePlans } from '../planner/store';
import type { NotificationPrefs } from './prefs';
import {
  EMPTY_PLAN_REMINDER_STATE,
  decidePlanReminders,
  type PlanReminderInput,
  type PlanReminderState,
} from './rules/plans';
import { ruleStorageKey, useNotifyDeadlines, useRuleRunner, type Rule } from './useRuleRunner';

// Runs beside the other notifications (NotificationRunner): every minute it asks rules/plans.ts
// which "Planned for today" reminders are due. Shown reminders are saved per account, like the
// rest. It also tells the plan store which planned items Canvas still lists, so their plans
// aren't pruned. It reads the same cached planner data the notifications hook does: no extra
// requests.

const STORAGE_PREFIX = 'tarpaulin.planReminders';
export const planReminderStorageKey = (scope: string) => ruleStorageKey(STORAGE_PREFIX, scope);

interface Input {
  plans: PlanReminderInput[];
  prefs: NotificationPrefs;
  now: Date;
  timeFmt: string;
}

const RULE: Rule<Input, PlanReminderState> = {
  prefix: STORAGE_PREFIX,
  parse: (raw) =>
    isRecord(raw) && isRecord(raw.shown) ? { shown: raw.shown as Record<string, number> } : null,
  empty: EMPTY_PLAN_REMINDER_STATE,
  decide: ({ plans, prefs, now, timeFmt }, state) =>
    decidePlanReminders(plans, prefs, state, now, timeFmt),
};

export function usePlanReminders() {
  const prefs = useSettings((s) => s.notifications);
  const timeFmt = useTimeFormat();
  const { now, deadlines } = useNotifyDeadlines();
  const account = useAccountScope();
  const plans = useAccountPlans();
  const markSeen = usePlans((s) => s.markSeen);

  // Canvas's view of each planned item: its current title, and whether it's handed in.
  const canvas = useMemo(
    () => (deadlines.query.data ? indexByPlanKey(deadlines.data) : null),
    [deadlines],
  );

  const seen = useMemo(
    () => (canvas ? Object.keys(plans).filter((k) => canvas.has(k)) : []),
    [canvas, plans],
  );
  useEffect(() => {
    if (account && seen.length) markSeen(account, seen);
  }, [account, seen, markSeen]);

  const items = useMemo<PlanReminderInput[]>(
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
            done: p.status === 'done' || Boolean(live?.isDone),
          },
        ];
      }),
    [plans, canvas],
  );

  // Wait for Canvas, so work already handed in isn't announced (unless Canvas can't be reached).
  const ready = canvas !== null || deadlines.query.isError;
  const input = useMemo(
    () => (ready ? { plans: items, prefs, now, timeFmt } : null),
    [ready, items, prefs, now, timeFmt],
  );
  useRuleRunner(RULE, input);
}
