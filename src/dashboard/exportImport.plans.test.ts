import { beforeEach, describe, expect, it } from 'vitest';
import { planAccount, planItemKey } from '../planner/keys';
import { EMPTY_PLAN, usePlans, type Plan } from '../planner/store';
import { exportDashboard, importDashboard } from './exportImport';
import { buildPage, PRESETS } from './presets';

const A = planAccount('https://a.example.edu', '1');
const B = planAccount('https://b.example.edu', '7');
const PS4 = planItemKey('assignment', '10', '400');
const QUIZ = planItemKey('quiz', '10', '1');
const pages = [buildPage(PRESETS[0])];
const plan = (p: Partial<Plan>): Plan => ({ ...EMPTY_PLAN, updatedAt: Date.now(), ...p });

beforeEach(() => usePlans.setState({ plans: {} }));

describe('export / import of My plan', () => {
  it('goes with notes and checklists, and only then', () => {
    usePlans.setState({ plans: { [A]: { [PS4]: plan({ status: 'doing' }) } } });
    const plans = usePlans.getState().plans;
    expect(importDashboard(exportDashboard(pages, null, plans)).plans).toBeNull();
    const json = exportDashboard(pages, null, plans, { includeLocalData: true });
    expect(JSON.parse(json)).toHaveProperty(['plans', A, PS4, 'status'], 'doing');
  });

  it('round-trips, each plan staying under its own account', () => {
    const original = {
      [A]: {
        [PS4]: plan({
          status: 'doing',
          doDate: { day: '2026-10-22', time: '14:30' },
          checklist: [{ id: 's1', text: 'Outline', done: true }],
          title: 'Problem set 4',
        }),
      },
      [B]: { [PS4]: plan({ status: 'done' }) },
    };
    const result = importDashboard(
      exportDashboard(pages, null, original, { includeLocalData: true }),
    );
    expect(result.plans).toEqual(original);

    // On a device that already has a plan for A: A's arrive under A, and B's stay under B,
    // never mixed into A's.
    usePlans.setState({ plans: { [A]: { [QUIZ]: plan({ status: 'done' }) } } });
    usePlans.getState().importPlans(result.plans!);
    const plans = usePlans.getState().plans;
    expect(Object.keys(plans[A]).sort()).toEqual([PS4, QUIZ].sort());
    expect(plans[A][PS4].status).toBe('doing');
    expect(plans[B][PS4].status).toBe('done');
  });

  it('keeps the newer plan when both have one', () => {
    usePlans.setState({ plans: { [A]: { [PS4]: plan({ status: 'done', updatedAt: 2_000 }) } } });
    usePlans
      .getState()
      .importPlans({ [A]: { [PS4]: plan({ status: 'doing', updatedAt: 1_000 }) } });
    expect(usePlans.getState().plans[A][PS4].status).toBe('done');
  });

  it('drops broken plans in a file and still imports the pages', () => {
    const file = JSON.parse(exportDashboard(pages, null, {})) as Record<string, unknown>;
    file.plans = { [A]: { [PS4]: { status: 'doing' }, nonsense: { status: 'doing' } }, x: 5 };
    const result = importDashboard(JSON.stringify(file));
    expect(result.pages).toHaveLength(1);
    expect(Object.keys(result.plans![A])).toEqual([PS4]);
    file.plans = 'garbage';
    expect(importDashboard(JSON.stringify(file)).plans).toBeNull();
  });
});
