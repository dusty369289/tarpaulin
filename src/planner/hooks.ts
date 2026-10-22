import { useCallback, useMemo } from 'react';
import { useAccountScope } from '../canvas/account';
import { newId } from '../lib/id';
import { plansOn, planSummary, type PlannedItem, type PlanSummary } from './selectors';
import {
  EMPTY_PLAN,
  usePlans,
  type AccountPlans,
  type DoDate,
  type Plan,
  type PlanMeta,
  type PlanStatus,
} from './store';

const NO_PLANS: AccountPlans = {};

/** Every plan of the signed-in account (item key → plan). */
export function useAccountPlans(): AccountPlans {
  const account = useAccountScope();
  return usePlans((s) => (account && s.plans[account]) || NO_PLANS);
}

/** One item's plan in the signed-in account, or null when nothing is planned. */
export function usePlan(key: string | null): Plan | null {
  const account = useAccountScope();
  return usePlans((s) => (account && key && s.plans[account]?.[key]) || null);
}

/** One item's plan at a glance (see planSummary). */
export function usePlanSummary(key: string | null, now: Date, timeFmt?: string): PlanSummary {
  const plan = usePlan(key);
  return useMemo(() => planSummary(plan, now, timeFmt), [plan, now, timeFmt]);
}

/** Items the signed-in account planned for `day`, for the calendar. */
export function usePlansOn(day: Date): PlannedItem[] {
  const plans = useAccountPlans();
  return useMemo(() => plansOn(plans, day), [plans, day]);
}

/** Changes to one item's plan; each is a no-op until the account is known. */
export function usePlanEditor(key: string | null, meta?: PlanMeta) {
  const account = useAccountScope();
  const plan = usePlan(key);
  const edit = usePlans((s) => s.edit);
  const { title, courseName, dueAt } = meta ?? {};
  const change = useCallback(
    (fn: (p: Plan) => Partial<Plan>) => {
      if (account && key) edit(account, key, fn, { title, courseName, dueAt });
    },
    [account, key, edit, title, courseName, dueAt],
  );
  return useMemo(
    () => ({
      ready: Boolean(account && key),
      plan: plan ?? EMPTY_PLAN,
      setStatus: (status: PlanStatus) => change(() => ({ status })),
      setDoDate: (doDate: DoDate | null) => change(() => ({ doDate })),
      addStep: (text: string) => {
        const t = text.trim();
        if (t)
          change((p) => ({
            checklist: [...p.checklist, { id: newId('s'), text: t, done: false }],
          }));
      },
      toggleStep: (id: string) =>
        change((p) => ({
          checklist: p.checklist.map((s) => (s.id === id ? { ...s, done: !s.done } : s)),
        })),
      removeStep: (id: string) =>
        change((p) => ({ checklist: p.checklist.filter((s) => s.id !== id) })),
    }),
    [plan, change, account, key],
  );
}
