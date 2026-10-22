import { useCallback, useMemo } from 'react';
import { useAccountScope } from '../canvas/account';
import type { Deadline } from '../canvas/models';
import { newId } from '../lib/id';
import { planKeyForPlannerItem } from './keys';
import {
  nextStatus,
  planMetaOf,
  plansOn,
  planSummary,
  type PlannedItem,
  type PlanSummary,
} from './selectors';
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

/** Changes to plans of the signed-in account; each is a no-op until the account is known. */
export function usePlanActions() {
  const account = useAccountScope();
  const edit = usePlans((s) => s.edit);
  return useMemo(
    () => ({
      ready: Boolean(account),
      /** Changes one item's plan, keeping `meta` (what's known of the item) with it. */
      edit: (key: string, change: (p: Plan) => Partial<Plan>, meta?: PlanMeta) => {
        if (account) edit(account, key, change, meta);
      },
      /** Moves a planner item's plan on: Not started → In progress → Done → Not started. */
      cycleStatus: (d: Deadline) => {
        const key = planKeyForPlannerItem(d);
        if (account && key)
          edit(account, key, (p) => ({ status: nextStatus(p.status) }), planMetaOf(d));
      },
    }),
    [account, edit],
  );
}

/** Changes to one item's plan; each is a no-op until the account is known. */
export function usePlanEditor(key: string | null, meta?: PlanMeta) {
  const actions = usePlanActions();
  const plan = usePlan(key);
  const { title, courseName, dueAt } = meta ?? {};
  const change = useCallback(
    (fn: (p: Plan) => Partial<Plan>) => {
      if (key) actions.edit(key, fn, { title, courseName, dueAt });
    },
    [actions, key, title, courseName, dueAt],
  );
  return useMemo(
    () => ({
      ready: Boolean(actions.ready && key),
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
    [plan, change, actions.ready, key],
  );
}
