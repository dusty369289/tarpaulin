import { describe, expect, it } from 'vitest';
import {
  EMPTY_PLAN_REMINDER_STATE,
  planPlanReminders,
  type PlanReminderInput,
  type PlanReminderState,
} from './planRules';
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from './prefs';

const at = (h: number, m = 0, day = 22) => new Date(2026, 9, day, h, m);
const PS4: PlanReminderInput = {
  key: 'assignment:10:400',
  title: 'Problem set 4',
  courseName: 'Physics',
  doDate: { day: '2026-10-22', time: null },
  done: false,
};
const on = { enabled: true, prefs: DEFAULT_NOTIFICATION_PREFS };

/** Runs the rule at each time in turn, carrying its state, and collects every title shown. */
function runAt(
  times: Date[],
  plans: PlanReminderInput[] = [PS4],
  opts: { enabled: boolean; prefs: NotificationPrefs } = on,
) {
  let state: PlanReminderState = EMPTY_PLAN_REMINDER_STATE;
  const shown: string[] = [];
  for (const t of times) {
    const r = planPlanReminders(plans, opts, state, t, 'HH:mm');
    state = r.state;
    shown.push(...r.notes.map((n) => `${n.title} | ${n.body}`));
  }
  return shown;
}

describe('do-date reminders', () => {
  it('reminds on the morning of the do-date, once', () => {
    expect(runAt([at(8, 59)])).toEqual([]);
    expect(runAt([at(8, 59), at(9), at(9, 1), at(13)])).toEqual([
      'Planned for today: Problem set 4 | Physics',
    ]);
  });

  it('reminds at the time set, with the time', () => {
    const timed = { ...PS4, doDate: { day: '2026-10-22', time: '14:30' } };
    expect(runAt([at(9), at(14, 29)], [timed])).toEqual([]);
    expect(runAt([at(14, 30), at(15)], [timed])).toEqual([
      'Planned for today: Problem set 4 | Physics · 14:30',
    ]);
  });

  it('reminds again when the do-date moves, but not for another day', () => {
    const { state } = planPlanReminders([PS4], on, EMPTY_PLAN_REMINDER_STATE, at(9));
    const later = { ...PS4, doDate: { day: '2026-10-22', time: '16:00' } };
    expect(planPlanReminders([later], on, state, at(16)).notes).toHaveLength(1);
    // The day after: a missed do-date isn't caught up on.
    expect(runAt([at(9, 0, 23)])).toEqual([]);
  });

  it('holds back during quiet hours and comes once they end', () => {
    const quiet: NotificationPrefs = {
      ...DEFAULT_NOTIFICATION_PREFS,
      quietHours: { enabled: true, start: '22:00', end: '10:00' },
    };
    const opts = { enabled: true, prefs: quiet };
    expect(runAt([at(9), at(9, 30)], [PS4], opts)).toEqual([]);
    expect(runAt([at(9), at(10), at(10, 1)], [PS4], opts)).toEqual([
      'Planned for today: Problem set 4 | Physics',
    ]);
  });

  it('stays quiet with the setting off, or all notifications off', () => {
    expect(runAt([at(9)], [PS4], { ...on, enabled: false })).toEqual([]);
    expect(
      runAt([at(9)], [PS4], {
        enabled: true,
        prefs: { ...DEFAULT_NOTIFICATION_PREFS, enabled: false },
      }),
    ).toEqual([]);
  });

  it('skips work that’s done', () => {
    expect(runAt([at(9)], [{ ...PS4, done: true }])).toEqual([]);
  });

  it('sums up a busy day', () => {
    const many = [1, 2, 3, 4].map((i) => ({ ...PS4, key: `assignment:10:${i}` }));
    expect(runAt([at(9)], many)).toEqual([
      '4 things planned for today | Open Tarpaulin to see your plan.',
    ]);
  });

  it('forgets old reminders after a fortnight', () => {
    const old = { shown: { 'x@2026-10-01T09:00': at(9, 0, 1).getTime() } };
    expect(planPlanReminders([], on, old, at(9)).state.shown).toEqual({});
  });
});
