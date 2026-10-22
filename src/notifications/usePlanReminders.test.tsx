import { act } from '@testing-library/react';
import { format } from 'date-fns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, useSettings } from '../app/settingsStore';
import { accountScope } from '../canvas/account';
import { planItemKey } from '../planner/keys';
import { EMPTY_PLAN, usePlans } from '../planner/store';
import { fixtureBundle, recordedAt, renderWithCanvas } from '../test/render';
import { planReminderStorageKey } from './usePlanReminders';
import { NotificationRunner } from './useNotifications';

const shown = vi.hoisted(() => [] as { title: string; body: string }[]);
vi.mock('../app/desktop', () => ({
  showNotification: async (title: string, body: string) => void shown.push({ title, body }),
}));

const ACCOUNT = accountScope(fixtureBundle.meta.baseUrl, '1001');
const OTHER = accountScope('https://other.example.edu', '1001');
/** Midday on the recorded day, on this machine's clock. */
const NOON = new Date(recordedAt.getFullYear(), recordedAt.getMonth(), recordedAt.getDate(), 12);
const TODAY = format(NOON, 'yyyy-MM-dd');
const QUIZ_17 = planItemKey('quiz', '1028', '1094'); // unsubmitted, due 23 Oct
const ITEM_20 = planItemKey('assignment', '1032', '1099'); // due 30 Oct, past the loaded window
const ITEM_15 = planItemKey('assignment', '1028', '1091'); // already submitted in Canvas
const planned = () =>
  shown.filter((n) => n.title.startsWith('Planned for today')).map((n) => n.title);

async function run() {
  const view = renderWithCanvas(<NotificationRunner />);
  for (let i = 0; i < 20; i++) await act(() => new Promise((r) => setTimeout(r, 20)));
  view.unmount();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
  shown.length = 0;
  useSettings.setState(DEFAULT_SETTINGS);
  const doToday = { ...EMPTY_PLAN, doDate: { day: TODAY, time: null }, updatedAt: Date.now() };
  usePlans.setState({
    plans: {
      [ACCOUNT]: {
        [QUIZ_17]: { ...doToday, title: 'Old title' },
        [ITEM_20]: { ...doToday, title: 'Problem set 4' },
        [ITEM_15]: doToday,
      },
      [OTHER]: { [planItemKey('assignment', '1', '1')]: { ...doToday, title: 'Not mine' } },
    },
  });
});
afterEach(() => vi.useRealTimers());

describe('do-date reminders in the runner', () => {
  it('reminds once, for this account’s unfinished work only', async () => {
    await run();
    // Canvas's current title where it's loaded, the plan's copy where it isn't; nothing for
    // work already submitted, or for another account.
    expect(planned().sort()).toEqual([
      'Planned for today: Item 17',
      'Planned for today: Problem set 4',
    ]);
    expect(localStorage.getItem(planReminderStorageKey(ACCOUNT))).toContain(QUIZ_17);
    await run();
    expect(planned()).toHaveLength(2);
  });

  it('waits out quiet hours', async () => {
    useSettings.setState({
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        quietHours: { enabled: true, start: '11:00', end: '13:00' },
      },
    });
    await run();
    expect(planned()).toEqual([]);
    vi.setSystemTime(new Date(NOON.getTime() + 61 * 60_000));
    await run();
    expect(planned()).toHaveLength(2);
  });

  it('stays quiet with the setting off', async () => {
    useSettings.setState((s) => ({ notifications: { ...s.notifications, planned: false } }));
    await run();
    expect(planned()).toEqual([]);
  });
});
