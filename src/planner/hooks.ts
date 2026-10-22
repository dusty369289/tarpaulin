import { useCallback, useMemo } from 'react';
import { useCanvas } from '../canvas/CanvasProvider';
import { useProfile } from '../canvas/hooks';
import { newId } from '../lib/id';
import { planAccount } from './keys';
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

/**
 * The signed-in account's scope, `<baseUrl>|<userId>`, worked out like notifications do: null
 * until the profile is known (or, if it can't load, the Canvas address alone).
 */
export function usePlanAccount(): string | null {
  const baseUrl = useCanvas().client?.baseUrl;
  const profile = useProfile();
  const userId = profile.data?.id ?? (profile.isError ? '' : null);
  return baseUrl && userId !== null ? planAccount(baseUrl, userId) : null;
}

/** Every plan of the signed-in account (item key → plan). */
export function useAccountPlans(): AccountPlans {
  const account = usePlanAccount();
  return usePlans((s) => (account && s.plans[account]) || NO_PLANS);
}

/** One item's plan in the signed-in account, or null when nothing is planned. */
export function usePlan(key: string | null): Plan | null {
  const account = usePlanAccount();
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
  const account = usePlanAccount();
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
