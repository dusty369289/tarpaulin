import { beforeEach, describe, expect, it } from 'vitest';
import { accountScope } from '../canvas/account';
import { parsePlanItemKey, planItemKey, planKeyForPlannerItem, planKeyForReaderItem } from './keys';
import { plansOn, planSummary } from './selectors';
import {
  EMPTY_PLAN,
  mergePlans,
  parsePlans,
  PLAN_STORAGE_KEY,
  PlanSchema,
  prunePlans,
  PRUNE_AFTER_MS,
  usePlans,
  type Plan,
} from './store';

const A = accountScope('https://a.example.edu', '1');
const B = accountScope('https://b.example.edu', '1');
const PS4 = planItemKey('assignment', '10', '400');
const QUIZ = planItemKey('quiz', '10', '400');
const plan = (p: Partial<Plan>): Plan => ({ ...EMPTY_PLAN, updatedAt: Date.now(), ...p });

beforeEach(() => usePlans.setState({ plans: {} }));

describe('plan keys', () => {
  it('names the kind, course and id, so a quiz and an assignment with one id differ', () => {
    expect(PS4).toBe('assignment:10:400');
    expect(QUIZ).not.toBe(PS4);
    expect(parsePlanItemKey(PS4)).toEqual({ type: 'assignment', courseId: '10', id: '400' });
    expect(parsePlanItemKey('event:10:4')).toBeNull();
  });

  it('matches between the planner and the reader', () => {
    const fromPlanner = planKeyForPlannerItem({
      type: 'discussion_topic',
      courseId: '10',
      data: { id: '7' },
    });
    expect(fromPlanner).toBe('discussion:10:7');
    expect(planKeyForReaderItem({ kind: 'discussion', courseId: '10', id: '7' })).toBe(fromPlanner);
    // Not work you plan.
    expect(
      planKeyForPlannerItem({ type: 'calendar_event', courseId: '10', data: { id: '1' } }),
    ).toBeNull();
    expect(
      planKeyForPlannerItem({ type: 'assignment', courseId: null, data: { id: '1' } }),
    ).toBeNull();
    expect(planKeyForReaderItem({ kind: 'event', courseId: '10', id: '1' })).toBeNull();
    expect(
      planKeyForReaderItem({ kind: 'discussion', courseId: '10', id: '1', noPlan: true }),
    ).toBeNull();
  });
});

describe('plan store', () => {
  it('keeps each account’s plans apart', () => {
    const { edit } = usePlans.getState();
    edit(A, PS4, () => ({ status: 'doing' }), { title: 'Problem set 4' });
    expect(usePlans.getState().plans[A][PS4]).toMatchObject({
      status: 'doing',
      title: 'Problem set 4',
    });
    expect(usePlans.getState().plans[B]).toBeUndefined();
    edit(B, PS4, () => ({ status: 'done' }));
    expect(usePlans.getState().plans[A][PS4].status).toBe('doing');
    expect(usePlans.getState().plans[B][PS4].status).toBe('done');
  });

  it('forgets a plan that goes back to empty', () => {
    const { edit } = usePlans.getState();
    edit(A, PS4, () => ({ status: 'doing' }));
    edit(A, PS4, () => ({ status: 'todo' }));
    expect(usePlans.getState().plans).toEqual({});
  });

  it('persists under its own key and reads back through validation', async () => {
    usePlans.getState().edit(A, PS4, () => ({ doDate: { day: '2026-10-22', time: null } }));
    const stored = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY)!) as {
      state: { plans: unknown };
    };
    expect(stored.state.plans).toHaveProperty([A, PS4, 'doDate', 'day'], '2026-10-22');

    // Corrupt it, then rehydrate: bad fields fall back, good ones stay, nothing throws.
    stored.state.plans = {
      [A]: {
        [PS4]: {
          status: 'whenever',
          doDate: { day: '2026-10-22', time: '25:99' },
          checklist: [{ id: 's1', text: 'Outline', done: true }],
        },
        [planItemKey('assignment', '10', '1')]: { status: 'whenever' },
        [QUIZ]: { status: 'doing', checklist: [{ id: 's1', text: 'Read', done: false }, 42] },
        'nonsense-key': { status: 'doing' },
      },
      'no-scope': { [PS4]: { status: 'doing' } },
    };
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(stored));
    await usePlans.persist.rehydrate();
    const plans = usePlans.getState().plans;
    expect(Object.keys(plans)).toEqual([A]);
    expect(Object.keys(plans[A]).sort()).toEqual([PS4, QUIZ].sort());
    expect(plans[A][PS4]).toMatchObject({ status: 'todo', doDate: null });
    // A plan that validates down to nothing is dropped (the one above), the rest kept.
    expect(plans[A][QUIZ].checklist).toEqual([{ id: 's1', text: 'Read', done: false }]);
  });

  it('survives garbage in storage', async () => {
    localStorage.setItem(PLAN_STORAGE_KEY, '{"state":{"plans":"lots"},"version":1}');
    await usePlans.persist.rehydrate();
    expect(usePlans.getState().plans).toEqual({});
    localStorage.setItem(PLAN_STORAGE_KEY, 'not json');
    await expect(usePlans.persist.rehydrate()).resolves.not.toThrow();
  });

  it('validates field by field', () => {
    expect(PlanSchema.parse({ status: 7, checklist: 'x', doDate: { day: '2026-02-31' } })).toEqual(
      EMPTY_PLAN,
    );
    expect(parsePlans(null)).toEqual({});
    expect(parsePlans({ [A]: [] })).toEqual({});
  });
});

describe('pruning', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  const old = now - PRUNE_AFTER_MS - 1;

  it('drops plans whose item has been gone for 60 days', () => {
    const pruned = prunePlans(
      {
        [A]: {
          [PS4]: plan({ status: 'doing', updatedAt: old, seenAt: old }),
          [QUIZ]: plan({ status: 'doing', updatedAt: old, seenAt: now - 1000 }),
        },
        [B]: { [PS4]: plan({ status: 'doing', updatedAt: old, seenAt: old }) },
      },
      now,
    );
    expect(Object.keys(pruned)).toEqual([A]);
    expect(Object.keys(pruned[A])).toEqual([QUIZ]);
  });

  it('keeps plans for work due in the future even when unseen', () => {
    const pruned = prunePlans(
      {
        [A]: {
          [PS4]: plan({
            status: 'doing',
            updatedAt: old,
            seenAt: 0,
            dueAt: new Date(now + 86_400_000).toISOString(),
          }),
        },
      },
      now,
    );
    expect(pruned[A][PS4]).toBeDefined();
  });

  it('markSeen refreshes plans still in Canvas and prunes the rest', () => {
    usePlans.setState({
      plans: {
        [A]: {
          [PS4]: plan({ status: 'doing', updatedAt: old, seenAt: old }),
          [QUIZ]: plan({ status: 'doing', updatedAt: old, seenAt: old }),
        },
      },
    });
    usePlans.getState().markSeen(A, [PS4], now);
    expect(usePlans.getState().plans[A][PS4].seenAt).toBe(now);
    expect(usePlans.getState().plans[A][QUIZ]).toBeUndefined();
  });
});

describe('merging', () => {
  it('keeps the more recently changed plan of an item', () => {
    const merged = mergePlans(
      { [A]: { [PS4]: plan({ status: 'doing', updatedAt: 2 }) } },
      {
        [A]: {
          [PS4]: plan({ status: 'done', updatedAt: 1 }),
          [QUIZ]: plan({ status: 'done', updatedAt: 1 }),
        },
        [B]: { [PS4]: plan({ status: 'done', updatedAt: 1 }) },
      },
    );
    expect(merged[A][PS4].status).toBe('doing');
    expect(merged[A][QUIZ].status).toBe('done');
    expect(merged[B][PS4].status).toBe('done');
  });
});

describe('selectors', () => {
  const now = new Date(2026, 9, 20, 12); // a Tuesday
  it('summarises a plan in a line', () => {
    expect(planSummary(null, now).label).toBe('Not planned yet');
    const s = planSummary(
      plan({
        doDate: { day: '2026-10-22', time: null },
        checklist: [
          { id: '1', text: 'a', done: true },
          { id: '2', text: 'b', done: true },
          { id: '3', text: 'c', done: false },
          { id: '4', text: 'd', done: false },
        ],
      }),
      now,
    );
    expect(s).toMatchObject({ stepsDone: 2, stepsTotal: 4 });
    expect(s.label).toBe('Planned for Thu · 2 of 4 steps');
    expect(
      planSummary(plan({ status: 'doing', doDate: { day: '2026-10-21', time: '14:30' } }), now)
        .label,
    ).toBe('In progress · Planned for Tomorrow 14:30');
  });

  it('lists what’s planned on a day, untimed first, then by time', () => {
    const items = plansOn(
      {
        [PS4]: plan({ title: 'Late', doDate: { day: '2026-10-20', time: '18:00' } }),
        [QUIZ]: plan({ title: 'Early', doDate: { day: '2026-10-20', time: '08:00' } }),
        'discussion:10:1': plan({ title: 'Any time', doDate: { day: '2026-10-20', time: null } }),
        'discussion:10:2': plan({ title: 'Other day', doDate: { day: '2026-10-21', time: null } }),
      },
      now,
    );
    expect(items.map((i) => i.plan.title)).toEqual(['Any time', 'Early', 'Late']);
    expect(items[1]).toMatchObject({ type: 'quiz', courseId: '10', id: '400', hasTime: true });
    expect(items[1].at).toEqual(new Date(2026, 9, 20, 8));
  });
});
