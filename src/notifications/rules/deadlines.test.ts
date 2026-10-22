import { describe, expect, it } from 'vitest';
import { inQuietHours } from '../core';
import { DEFAULT_NOTIFICATION_PREFS as DEFAULTS, NotificationPrefsSchema } from '../prefs';
import {
  EMPTY_STATE,
  decideNotifications,
  formatRemaining,
  type NotifyInput,
  type NotifyState,
} from './deadlines';

const now = new Date('2026-10-21T12:00:00');
const at = (h: number) => new Date(now.getTime() + h * 3600_000);
const empty: NotifyInput = { deadlines: null, announcements: null, graded: null, scores: null };
const deadline = (key: string, dueInHours: number, done = false) => ({
  key,
  title: `Task ${key}`,
  courseName: 'Algorithms',
  dueAt: at(dueInHours),
  done,
});

/** Runs the planner over a sequence of moments, carrying state like the hook does. */
function run(steps: Array<{ input: NotifyInput; when: Date }>, prefs = DEFAULTS) {
  let state: NotifyState = EMPTY_STATE;
  return steps.map(({ input, when }) => {
    const out = decideNotifications(input, prefs, state, when, 'HH:mm');
    state = out.state;
    return out.notes;
  });
}

describe('deadline reminders', () => {
  it('reminds once per lead time, closest lead first if the app was closed', () => {
    const d = deadline('a', 30);
    const [far, dayBefore, sameDay, hourBefore, again] = run([
      { input: { ...empty, deadlines: [d] }, when: now }, // 30h out: before the 1-day lead
      { input: { ...empty, deadlines: [d] }, when: at(7) }, // 23h out
      { input: { ...empty, deadlines: [d] }, when: at(8) }, // still inside 1 day: no repeat
      { input: { ...empty, deadlines: [d] }, when: at(29.5) }, // 30 min out: the 1-hour lead
      { input: { ...empty, deadlines: [d] }, when: at(29.9) },
    ]);
    expect(far).toEqual([]);
    expect(dayBefore).toHaveLength(1);
    expect(dayBefore[0].title).toBe('Due in 23 hours: Task a');
    expect(dayBefore[0].body).toBe('Algorithms · tomorrow 18:00');
    expect(sameDay).toEqual([]);
    expect(hourBefore[0].title).toBe('Due in 30 minutes: Task a');
    expect(again).toEqual([]);
  });

  it('skips straight to the closest lead after the app was closed (no burst)', () => {
    const [notes] = run([{ input: { ...empty, deadlines: [deadline('a', 0.5)] }, when: now }]);
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toMatch(/^Due in 30 minutes/);
  });

  it('ignores finished and past work', () => {
    const [notes] = run([
      {
        input: { ...empty, deadlines: [deadline('done', 2, true), deadline('past', -1)] },
        when: now,
      },
    ]);
    expect(notes).toEqual([]);
  });

  it('reminds again when a due date moves', () => {
    const [first, moved] = run([
      { input: { ...empty, deadlines: [deadline('a', 2)] }, when: now },
      { input: { ...empty, deadlines: [{ ...deadline('a', 5), dueAt: at(5) }] }, when: at(0.1) },
    ]);
    expect(first).toHaveLength(1);
    expect(moved).toHaveLength(1);
  });

  it('summarises a pile of reminders', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((k) => deadline(k, 2));
    const [notes] = run([{ input: { ...empty, deadlines: many }, when: now }]);
    expect(notes).toEqual([{ title: '5 deadlines coming up', body: expect.any(String) }]);
  });
});

describe('announcements and grades', () => {
  const ann = (id: string, hoursAgo = 1) => ({
    id,
    title: `News ${id}`,
    courseName: 'Databases',
    postedAt: at(-hoursAgo),
  });

  it('records a baseline first, then reports only what is new', () => {
    const [first, second, third] = run([
      { input: { ...empty, announcements: [ann('1'), ann('2')] }, when: now },
      { input: { ...empty, announcements: [ann('1'), ann('2'), ann('3')] }, when: at(1) },
      { input: { ...empty, announcements: [ann('2'), ann('3')] }, when: at(2) },
    ]);
    expect(first).toEqual([]);
    expect(second).toEqual([{ title: 'News 3', body: 'New announcement · Databases' }]);
    expect(third).toEqual([]);
  });

  it('does not report old announcements as new', () => {
    const [, second] = run([
      { input: { ...empty, announcements: [] }, when: now },
      { input: { ...empty, announcements: [ann('old', 24 * 5)] }, when: at(1) },
    ]);
    expect(second).toEqual([]);
  });

  it('waits for data before taking the baseline', () => {
    const [loading, loaded, fresh] = run([
      { input: empty, when: now },
      { input: { ...empty, announcements: [ann('1')] }, when: at(0.1) },
      { input: { ...empty, announcements: [ann('1'), ann('2')] }, when: at(0.2) },
    ]);
    expect(loading).toEqual([]);
    expect(loaded).toEqual([]); // baseline, not "new"
    expect(fresh).toHaveLength(1);
  });

  it('reports newly graded work and real course grade changes', () => {
    const g = (key: string) => ({ key, title: `PS ${key}`, courseName: 'Algorithms' });
    const s = (score: number | null) => [{ courseId: 'c1', courseName: 'Algorithms', score }];
    const [base, loadedScore, changed, same] = run([
      { input: { ...empty, graded: [g('1')], scores: s(null) }, when: now },
      { input: { ...empty, graded: [g('1')], scores: s(88) }, when: at(1) },
      { input: { ...empty, graded: [g('1'), g('2')], scores: s(90.25) }, when: at(2) },
      { input: { ...empty, graded: [g('1'), g('2')], scores: s(90.25) }, when: at(3) },
    ]);
    expect(base).toEqual([]);
    expect(loadedScore).toEqual([]); // null → 88 is a score arriving, not a change
    expect(changed.map((n) => n.title)).toEqual(['Graded: PS 2', 'Algorithms: 88.0% → 90.3%']);
    expect(same).toEqual([]);
  });

  it('forgets the baseline when a category is switched off', () => {
    const off = { ...DEFAULTS, announcements: false };
    let state = decideNotifications(
      { ...empty, announcements: [ann('1')] },
      DEFAULTS,
      EMPTY_STATE,
      now,
    ).state;
    state = decideNotifications(
      { ...empty, announcements: [ann('1'), ann('2')] },
      off,
      state,
      at(1),
    ).state;
    expect(state.seenAnnouncements).toBeNull();
    const back = decideNotifications(
      { ...empty, announcements: [ann('1'), ann('2'), ann('3')] },
      DEFAULTS,
      state,
      at(2),
    );
    expect(back.notes).toEqual([]); // fresh baseline, not three "new" ones
  });
});

describe('quiet hours and switches', () => {
  const quiet = { ...DEFAULTS, quietHours: { enabled: true, start: '22:00', end: '08:00' } };

  it('detects quiet hours across midnight', () => {
    expect(inQuietHours(quiet, new Date('2026-10-21T23:30:00'))).toBe(true);
    expect(inQuietHours(quiet, new Date('2026-10-22T07:59:00'))).toBe(true);
    expect(inQuietHours(quiet, new Date('2026-10-22T08:00:00'))).toBe(false);
    expect(
      inQuietHours(
        { ...quiet, quietHours: { ...quiet.quietHours, start: '09:00', end: '17:00' } },
        now,
      ),
    ).toBe(true);
    expect(inQuietHours(DEFAULTS, new Date('2026-10-21T23:30:00'))).toBe(false);
  });

  it('holds reminders during quiet hours and delivers them afterwards', () => {
    const night = new Date('2026-10-21T23:00:00');
    const d = { ...deadline('a', 0), dueAt: new Date('2026-10-22T09:00:00') };
    const [held, morning] = run(
      [
        { input: { ...empty, deadlines: [d] }, when: night },
        { input: { ...empty, deadlines: [d] }, when: new Date('2026-10-22T08:01:00') },
      ],
      quiet,
    );
    expect(held).toEqual([]);
    expect(morning).toHaveLength(1);
  });

  it('sends nothing when notifications are off', () => {
    const [notes] = run([{ input: { ...empty, deadlines: [deadline('a', 0.5)] }, when: now }], {
      ...DEFAULTS,
      enabled: false,
    });
    expect(notes).toEqual([]);
  });
});

describe('prefs', () => {
  it('defaults to 1 day and 1 hour reminders with everything on', () => {
    expect(DEFAULTS).toMatchObject({ enabled: true, leads: [1440, 60], announcements: true });
  });
  it('falls back to defaults instead of failing on bad stored values', () => {
    expect(NotificationPrefsSchema.parse({ leads: 'nope' })).toEqual(DEFAULTS);
    expect(NotificationPrefsSchema.parse({ grades: false }).grades).toBe(false);
  });
  it('formats remaining time', () => {
    expect(formatRemaining(30_000)).toBe('1 minute');
    expect(formatRemaining(45 * 60_000)).toBe('45 minutes');
    expect(formatRemaining(3600_000)).toBe('1 hour');
    expect(formatRemaining(3 * 24 * 3600_000)).toBe('3 days');
  });
});
