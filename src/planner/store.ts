import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isAccountScope } from '../canvas/account';
import { DayKeySchema, TimeOfDaySchema } from '../lib/days';
import { isRecord } from '../lib/storage';
import { parsePlanItemKey } from './keys';

// "My plan": when you'll do a piece of Canvas work, where you are with it, and its steps. It
// lives only on this device (localStorage) and is never sent to Canvas. Plans are stored by
// account scope (`<baseUrl>|<userId>`), then by item key (`assignment:<courseId>:<id>`), see
// keys.ts.

export const PLAN_STORAGE_KEY = 'tarpaulin.plans';
export const PLANS_VERSION = 1;

export const PLAN_STATUSES = ['todo', 'doing', 'done'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** A plan is pruned once its item hasn't been seen in Canvas, nor the plan touched, nor the
 *  item due, for this long. */
export const PRUNE_AFTER_MS = 60 * 24 * 60 * 60_000;
/** How often "still in Canvas" is written back for one plan. */
const SEEN_EVERY_MS = 24 * 60 * 60_000;

export const StepSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().max(500),
  done: z.boolean(),
});
export type PlanStep = z.infer<typeof StepSchema>;

export const DoDateSchema = z.object({
  /** yyyy-MM-dd, on the wall clock times are shown in. */
  day: DayKeySchema,
  /** HH:mm, or null for "some time that day". */
  time: TimeOfDaySchema.nullable().default(null),
});
export type DoDate = z.infer<typeof DoDateSchema>;

/** Field by field, like the settings: a bad value falls back to empty, never a crash. */
export const PlanSchema = z.object({
  doDate: DoDateSchema.nullable().default(null).catch(null),
  status: z.enum(PLAN_STATUSES).default('todo').catch('todo'),
  checklist: z
    .array(z.unknown())
    .default([])
    .catch([])
    .transform((steps) => steps.flatMap((s) => StepSchema.safeParse(s).data ?? []).slice(0, 100)),
  /** Snapshots of the Canvas item, for reminders and the calendar when it isn't loaded. */
  title: z.string().max(300).default('').catch(''),
  courseName: z.string().max(300).default('').catch(''),
  dueAt: z.string().nullable().default(null).catch(null),
  /** When the plan last changed, and when its item was last seen in Canvas (ms). */
  updatedAt: z.number().default(0).catch(0),
  seenAt: z.number().default(0).catch(0),
});
export type Plan = z.infer<typeof PlanSchema>;

export const EMPTY_PLAN: Plan = PlanSchema.parse({});

/** Item key → plan, for one account. */
export type AccountPlans = Record<string, Plan>;
/** Account scope → that account's plans. */
export type PlansByAccount = Record<string, AccountPlans>;

/** Nothing planned: not worth keeping. */
export const isEmptyPlan = (p: Plan) =>
  p.status === 'todo' && p.doDate === null && p.checklist.length === 0;

/** Validates stored or imported plans. Unknown accounts, keys and broken plans are dropped. A
 *  plan without a valid change time counts as changed `now`, so it isn't pruned on sight. */
export function parsePlans(raw: unknown, now = Date.now()): PlansByAccount {
  const out: PlansByAccount = {};
  if (!isRecord(raw)) return out;
  for (const [account, plans] of Object.entries(raw)) {
    if (!isAccountScope(account) || !isRecord(plans)) continue;
    const kept: AccountPlans = {};
    for (const [key, value] of Object.entries(plans)) {
      if (!parsePlanItemKey(key) || !isRecord(value)) continue;
      const plan = PlanSchema.safeParse(value);
      if (plan.success && !isEmptyPlan(plan.data))
        kept[key] = plan.data.updatedAt > 0 ? plan.data : { ...plan.data, updatedAt: now };
    }
    if (Object.keys(kept).length) out[account] = kept;
  }
  return out;
}

/** Drops plans whose item seems gone: not seen in Canvas, not edited and not due in the last 60
 *  days. */
export function prunePlans(plans: PlansByAccount, now: number): PlansByAccount {
  const cutoff = now - PRUNE_AFTER_MS;
  const out: PlansByAccount = {};
  for (const [account, items] of Object.entries(plans)) {
    const kept = Object.fromEntries(
      Object.entries(items).filter(([, p]) => {
        const due = p.dueAt ? Date.parse(p.dueAt) : NaN;
        return Math.max(p.updatedAt, p.seenAt) >= cutoff || (!Number.isNaN(due) && due >= cutoff);
      }),
    );
    if (Object.keys(kept).length) out[account] = kept;
  }
  return out;
}

/** Plans from both; where both have one item, the more recently changed wins. */
export function mergePlans(into: PlansByAccount, from: PlansByAccount): PlansByAccount {
  const out: PlansByAccount = { ...into };
  for (const [account, items] of Object.entries(from)) {
    const mine = { ...out[account] };
    for (const [key, plan] of Object.entries(items))
      if (!mine[key] || plan.updatedAt > mine[key].updatedAt) mine[key] = plan;
    out[account] = mine;
  }
  return out;
}

/** What the reader and widgets know about the item, kept with the plan. */
export interface PlanMeta {
  title?: string;
  courseName?: string;
  dueAt?: string | null;
}

interface PlanState {
  plans: PlansByAccount;
  /** Changes one plan. An empty result removes it. */
  edit: (account: string, key: string, change: (p: Plan) => Partial<Plan>, meta?: PlanMeta) => void;
  /** Notes that these items are still in Canvas (keeps their plans from being pruned). */
  markSeen: (account: string, keys: string[], now?: number) => void;
  /** Adds imported plans (see mergePlans). */
  importPlans: (plans: PlansByAccount) => void;
}

function withPlan(plans: PlansByAccount, account: string, key: string, plan: Plan | null) {
  const items = { ...plans[account] };
  if (plan) items[key] = plan;
  else delete items[key];
  const out = { ...plans, [account]: items };
  if (!Object.keys(items).length) delete out[account];
  return out;
}

export const usePlans = create<PlanState>()(
  persist(
    (set) => ({
      plans: {},
      edit: (account, key, change, meta) =>
        set((s) => {
          const before = s.plans[account]?.[key] ?? EMPTY_PLAN;
          const now = Date.now();
          const next = PlanSchema.parse({
            ...before,
            ...Object.fromEntries(Object.entries(meta ?? {}).filter(([, v]) => v !== undefined)),
            ...change(before),
            updatedAt: now,
            seenAt: now,
          });
          return { plans: withPlan(s.plans, account, key, isEmptyPlan(next) ? null : next) };
        }),
      markSeen: (account, keys, now = Date.now()) =>
        set((s) => {
          const items = s.plans[account];
          const stale = keys.filter((k) => items?.[k] && now - items[k].seenAt >= SEEN_EVERY_MS);
          if (!stale.length) return s;
          const next = { ...items };
          for (const k of stale) next[k] = { ...next[k], seenAt: now };
          return { plans: prunePlans({ ...s.plans, [account]: next }, now) };
        }),
      importPlans: (plans) => set((s) => ({ plans: mergePlans(s.plans, parsePlans(plans)) })),
    }),
    {
      name: PLAN_STORAGE_KEY,
      version: PLANS_VERSION,
      partialize: (s) => ({ plans: s.plans }),
      merge: (persisted, current) => ({
        ...current,
        plans: prunePlans(parsePlans((persisted as { plans?: unknown } | null)?.plans), Date.now()),
      }),
    },
  ),
);
