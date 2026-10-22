import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, useSettings } from '../../app/settingsStore';
import { FixtureTransport } from '../../canvas/transport';
import type { LoadSource } from '../../lib/load';
import { shown } from '../../test/desktopMock';
import { bundleWith, FIXTURE_ACCOUNT, loadSource, plannerItem } from '../../test/fixtures';
import { runNotifications } from '../../test/notifications';
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '../prefs';
import { weeklyStorageKey } from '../useWeeklyPreview';
import { decideWeeklyPreview, previewWeek, type WeeklyState } from './weekly';

// Weeks start on Monday unless a test says otherwise. Sunday 25 October 2026 is the evening
// before the week of Monday 26 October.
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m);
const due = (day: number, over: Partial<LoadSource> = {}): LoadSource =>
  loadSource({ date: at(day, 23, 59), ...over });
// Next week: Tue ×2, Thu ×3, Fri ×2. This week's and the week after's don't count.
const NEXT_WEEK = [
  due(27),
  due(27),
  due(29),
  due(29),
  due(29),
  due(30),
  due(30),
  due(24),
  due(33),
  due(29, { isDone: true }),
  due(28, { type: 'calendar_event', isWork: false }),
];
const SEEN: WeeklyState = { lastWeek: null };
const prefs = (over: Partial<NotificationPrefs> = {}): NotificationPrefs => ({
  ...DEFAULT_NOTIFICATION_PREFS,
  ...over,
});
const plan = (
  now: Date,
  opts: {
    items?: LoadSource[] | null;
    prefs?: NotificationPrefs;
    prev?: WeeklyState | null;
    weekStartsOn?: 0 | 1;
  } = {},
) =>
  decideWeeklyPreview(
    { deadlines: opts.items === undefined ? NEXT_WEEK : opts.items },
    opts.prefs ?? prefs(),
    opts.prev === undefined ? SEEN : opts.prev,
    now,
    opts.weekStartsOn ?? 1,
  );

describe('weekly preview: when', () => {
  it('opens at 18:00 the day before the week starts and runs to the end of its first day', () => {
    expect(previewWeek(at(25, 17, 59), 1)).toBeNull();
    expect(previewWeek(at(25, 18), 1)).toEqual(at(26, 0));
    expect(previewWeek(at(26, 23, 59), 1)).toEqual(at(26, 0));
    expect(previewWeek(at(27, 0), 1)).toBeNull();
    expect(previewWeek(at(22, 18), 1)).toBeNull();
  });

  it('follows "Week starts on"', () => {
    expect(previewWeek(at(24, 18), 0)).toEqual(at(25, 0));
    expect(previewWeek(at(24, 17), 0)).toBeNull();
    expect(previewWeek(at(26, 0), 0)).toBeNull();
  });

  it('sums up next week on Sunday evening', () => {
    expect(plan(at(25, 17, 59)).notes).toEqual([]);
    const { notes, state } = plan(at(25, 18));
    expect(notes).toEqual([
      {
        title: 'Next week: 7 due, heaviest on Thursday (3)',
        body: 'A busy week ahead. Open Tarpaulin to plan it.',
      },
    ]);
    expect(state).toEqual({ lastWeek: '2026-10-26' });
  });

  it('says "This week" once the week has started', () => {
    expect(plan(at(26, 9)).notes[0]?.title).toBe('This week: 7 due, heaviest on Thursday (3)');
  });

  it('words a single item plainly', () => {
    expect(plan(at(25, 18), { items: [due(29)] }).notes[0]?.title).toBe(
      'Next week: 1 due, on Thursday',
    );
  });
});

describe('weekly preview: rules', () => {
  it('fires once per week', () => {
    const first = plan(at(25, 18));
    expect(first.notes).toHaveLength(1);
    expect(plan(at(25, 18, 1), { prev: first.state }).notes).toEqual([]);
    expect(plan(at(26, 8), { prev: first.state }).notes).toEqual([]);
    // The next week gets its own.
    expect(plan(at(32, 18), { prev: first.state, items: [due(34)] }).notes).toHaveLength(1);
  });

  it('waits for quiet hours to end without marking the week shown', () => {
    const quiet = prefs({ quietHours: { enabled: true, start: '17:00', end: '20:00' } });
    const held = plan(at(25, 18), { prefs: quiet });
    expect(held.notes).toEqual([]);
    expect(held.state).toEqual(SEEN);
    expect(plan(at(25, 20), { prefs: quiet, prev: held.state }).notes).toHaveLength(1);
    // Overnight quiet hours carry it into Monday morning.
    const night = prefs({ quietHours: { enabled: true, start: '17:00', end: '07:00' } });
    expect(plan(at(25, 23), { prefs: night }).notes).toEqual([]);
    expect(plan(at(26, 7), { prefs: night }).notes[0]?.title).toMatch(/^This week: 7 due/);
  });

  it('stays quiet when nothing is due, and tries again if work turns up', () => {
    const empty = plan(at(25, 18), { items: [due(29, { isDone: true }), due(24)] });
    expect(empty.notes).toEqual([]);
    expect(empty.state).toEqual(SEEN);
    expect(plan(at(25, 19), { prev: empty.state }).notes).toHaveLength(1);
  });

  it('waits for the planner to load', () => {
    expect(plan(at(25, 18), { items: null })).toEqual({ notes: [], state: SEEN });
  });

  it('is off with its setting or with notifications off', () => {
    expect(plan(at(25, 18), { prefs: prefs({ weekly: false }) }).notes).toEqual([]);
    expect(plan(at(25, 18), { prefs: prefs({ enabled: false }) }).notes).toEqual([]);
  });

  it("takes a new account's first look as a baseline", () => {
    expect(plan(at(25, 19), { prev: null })).toEqual({
      notes: [],
      state: { lastWeek: '2026-10-26' },
    });
    // Outside a window the first look just records that it looked.
    const quiet = plan(at(22, 12), { prev: null });
    expect(quiet).toEqual({ notes: [], state: SEEN });
    expect(plan(at(25, 18), { prev: quiet.state }).notes).toHaveLength(1);
  });
});

describe('weekly and planned notification switches', () => {
  it('default to on and load field by field, so settings saved before them keep the rest', () => {
    expect(DEFAULT_SETTINGS.notifications).toMatchObject({ weekly: true, planned: true });
    // Saved before the keys existed.
    expect(parseSettings({ notifications: { grades: false } }).notifications).toMatchObject({
      grades: false,
      weekly: true,
      planned: true,
    });
    expect(parseSettings({ notifications: { weekly: false } }).notifications.weekly).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The runner, against the recorded account with a made-up planner.

vi.mock('../../app/desktop', () => import('../../test/desktopMock'));
const previews = () => shown.filter((s) => / week: /.test(s.title));
const KEY = weeklyStorageKey(FIXTURE_ACCOUNT);
const dueOn = (day: number) => plannerItem(at(day, 12), { id: 7000 + day * 10 + ++n });
let n = 0;

const run = () =>
  runNotifications(
    new FixtureTransport(
      bundleWith({ '/api/v1/planner/items': [dueOn(27), dueOn(29), dueOn(29)] }),
    ),
  );

describe('weekly preview runner', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(25, 18, 30));
    shown.length = 0;
    useSettings.setState(DEFAULT_SETTINGS);
  });
  afterEach(() => vi.useRealTimers());

  it("baselines a new account, then previews the account's next week once", async () => {
    await run();
    expect(previews()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ lastWeek: '2026-10-26' });

    localStorage.setItem(KEY, JSON.stringify(SEEN));
    await run();
    expect(previews()).toEqual([
      expect.objectContaining({ title: 'Next week: 3 due, heaviest on Thursday (2)' }),
    ]);
    await run();
    expect(previews()).toHaveLength(1);
  });

  it('stays quiet with the setting off', async () => {
    useSettings.setState((s) => ({ notifications: { ...s.notifications, weekly: false } }));
    localStorage.setItem(KEY, JSON.stringify(SEEN));
    await run();
    expect(previews()).toEqual([]);
  });
});
