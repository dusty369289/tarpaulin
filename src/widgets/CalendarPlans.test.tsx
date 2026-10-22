import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixtureTransport } from '../canvas/transport';
import { planItemKey } from '../planner/keys';
import { usePlans } from '../planner/store';
import { bundleWith, FIXTURE_ACCOUNT as ACCOUNT, plannerItem } from '../test/fixtures';
import { renderWidget } from '../test/widgets';

// Do-dates from My plan on the Calendar: Wednesday 21 October 2026, weeks starting Monday 19.

const NOW = new Date(2026, 9, 21, 12);
const COURSE = '1031';

/** An essay due next Wednesday (outside this week), as the planner sends it. */
const ESSAY = plannerItem(new Date(2026, 9, 28, 12), {
  id: 7001,
  title: 'Essay',
  points: 50,
  courseId: Number(COURSE),
});
const KEY = planItemKey('assignment', COURSE, '7001');

function show(settings: Record<string, unknown> = {}) {
  const transport = new FixtureTransport(
    bundleWith({ '/api/v1/planner/items': [ESSAY], '/api/v1/calendar_events': [] }),
  );
  renderWidget('calendar', { view: 'week', ...settings }, { transport });
}

const planFor = (status: 'todo' | 'done', time: string | null = null) =>
  usePlans.getState().edit(ACCOUNT, KEY, () => ({ status, doDate: { day: '2026-10-22', time } }), {
    title: 'Essay',
    courseName: 'Course B1',
    dueAt: ESSAY.plannable.due_at,
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  usePlans.setState({ plans: {} });
});
afterEach(() => vi.useRealTimers());

describe('Calendar do-dates', () => {
  it('lists planned work on its do-date, even when it is due outside the week', async () => {
    planFor('todo');
    show();
    expect(await screen.findByText('Plan: Essay')).toBeInTheDocument();
    expect(screen.getByText('Planned')).toBeInTheDocument();
  });

  it('shows the planned time, and leaves work done in the plan off', async () => {
    planFor('todo', '15:30');
    show();
    expect(await screen.findByText('Plan: Essay')).toBeInTheDocument();
    act(() => planFor('done', '15:30'));
    expect(screen.queryByText('Plan: Essay')).toBeNull();
  });

  it('leaves do-dates out when the widget hides work', async () => {
    planFor('todo');
    show({ showWork: false });
    await screen.findByRole('button', { name: 'Today' });
    expect(screen.queryByText('Plan: Essay')).toBeNull();
  });
});
