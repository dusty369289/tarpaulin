import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WidgetHost } from '../dashboard/WidgetHost';
import { FixtureTransport } from '../canvas/transport';
import { planAccount, planItemKey } from '../planner/keys';
import { usePlans } from '../planner/store';
import { fixtureBundle, renderWithCanvas } from '../test/render';
import { defaultSettings } from './registry';

// Do-dates from My plan on the Calendar: Wednesday 21 October 2026, weeks starting Monday 19.

const NOW = new Date(2026, 9, 21, 12);
const ACCOUNT = planAccount(fixtureBundle.meta.baseUrl, '1001');
const COURSE = '1031';

/** An essay due next Wednesday (outside this week), as the planner sends it. */
const ESSAY = {
  context_type: 'Course',
  course_id: Number(COURSE),
  plannable_id: 7001,
  planner_override: null,
  plannable_type: 'assignment',
  new_activity: false,
  submissions: { submitted: false, excused: false, graded: false, late: false, missing: false },
  plannable_date: new Date(2026, 9, 28, 12).toISOString(),
  plannable: {
    id: 7001,
    title: 'Essay',
    points_possible: 50,
    due_at: new Date(2026, 9, 28, 12).toISOString(),
  },
  html_url: `/courses/${COURSE}/assignments/7001`,
  context_name: 'Course B1',
};
const KEY = planItemKey('assignment', COURSE, '7001');

function show(settings: Record<string, unknown> = {}) {
  const transport = new FixtureTransport({
    ...fixtureBundle,
    responses: {
      ...fixtureBundle.responses,
      '/api/v1/planner/items': [ESSAY],
      '/api/v1/calendar_events': [],
    },
  });
  renderWithCanvas(
    <WidgetHost
      id="cal"
      instance={{
        type: 'calendar',
        settings: { ...defaultSettings('calendar'), view: 'week', ...settings },
      }}
      size={{ w: 12, h: 12 }}
      editMode={false}
      onData={() => {}}
    />,
    transport,
  );
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
