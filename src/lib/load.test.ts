import { describe, expect, it } from 'vitest';
import {
  courseBaselines,
  countsTowardLoad,
  dayLevel,
  dayLoad,
  describeLoad,
  itemWeight,
  loadByDay,
  summariseWeek,
  weekLevel,
  weekLoad,
  type LoadSource,
} from './load';
import { loadSource } from '../test/fixtures';

const item = (date: string | null, over: Partial<LoadSource> = {}): LoadSource =>
  loadSource({ date: date ? new Date(`${date}T23:59:00`) : null, ...over });
const day = (d: string) => new Date(`${d}T00:00:00`);

describe('what counts', () => {
  it('counts unfinished work, not events, announcements, notes or finished work', () => {
    expect(countsTowardLoad(item('2026-10-22'))).toBe(true);
    expect(countsTowardLoad(item('2026-10-22', { type: 'quiz' }))).toBe(true);
    // Ungraded discussions have no submission but are still due.
    expect(countsTowardLoad(item('2026-10-22', { type: 'discussion_topic', isWork: false }))).toBe(
      true,
    );
    expect(countsTowardLoad(item('2026-10-22', { type: 'calendar_event', isWork: false }))).toBe(
      false,
    );
    expect(countsTowardLoad(item('2026-10-22', { type: 'announcement', isWork: false }))).toBe(
      false,
    );
    expect(countsTowardLoad(item('2026-10-22', { type: 'planner_note', isWork: false }))).toBe(
      false,
    );
    expect(countsTowardLoad(item('2026-10-22', { isDone: true }))).toBe(false);
    expect(countsTowardLoad(item(null))).toBe(false);
  });
});

describe('scoring', () => {
  it("compares points with the course's median item", () => {
    const course = [10, 10, 20, 100, 0, null].map((points) => item('2026-10-01', { points }));
    const other = item('2026-10-01', { courseId: 'c2', points: 50 });
    const b = courseBaselines([...course, other]);
    expect(b.get('c1')).toBe(15); // median of 10, 10, 20, 100
    expect(b.get('c2')).toBe(50);
    expect(itemWeight(item('x', { points: 20 }), b)).toBe(1);
    expect(itemWeight(item('x', { points: 30 }), b)).toBe(2);
    expect(itemWeight(item('x', { points: 60 }), b)).toBe(3);
    expect(itemWeight(item('x', { points: null }), b)).toBe(1);
    expect(itemWeight(item('x', { courseId: null, points: 500 }), b)).toBe(1);
  });

  it('counts finished work in the baseline but not in the load', () => {
    const done = [10, 10, 10].map((points) => item('2026-10-01', { points, isDone: true }));
    const exam = item('2026-10-22', { points: 100 });
    const byDay = loadByDay([exam], [...done, exam]);
    expect(dayLoad(byDay, day('2026-10-22'))).toEqual({
      score: 3,
      due: 1,
      points: 100,
      level: 'busy',
    });
    expect(dayLoad(byDay, day('2026-10-01')).due).toBe(0);
  });

  it('maps scores to levels', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(dayLevel)).toEqual([
      'none',
      'light',
      'light',
      'busy',
      'busy',
      'heavy',
      'heavy',
    ]);
    expect([0, 5, 6, 11, 12].map((s) => weekLevel(s))).toEqual([
      'none',
      'light',
      'busy',
      'busy',
      'heavy',
    ]);
    // A heavy day makes the week at least busy.
    expect(weekLevel(5, 'heavy')).toBe('busy');
  });

  it("ignores an item listed twice (from the shared window and the calendar's own)", () => {
    const a = item('2026-10-22');
    expect(dayLoad(loadByDay([a, a]), day('2026-10-22')).due).toBe(1);
  });
});

describe('describing', () => {
  it('reads as level, count and points', () => {
    const byDay = loadByDay([10, 50, 60].map((points) => item('2026-10-22', { points })));
    expect(describeLoad(dayLoad(byDay, day('2026-10-22')))).toBe('busy: 3 due, 120 points');
    expect(
      describeLoad(dayLoad(loadByDay([item('2026-10-22', { points: null })]), day('2026-10-22'))),
    ).toBe('light: 1 due');
    expect(describeLoad(dayLoad(byDay, day('2026-10-23')))).toBeNull();
  });

  it('summarises a busy week with its heaviest day', () => {
    // Mon 19 Oct 2026 to Sun 25 Oct.
    const items = [
      item('2026-10-19'),
      item('2026-10-20'),
      item('2026-10-21'),
      item('2026-10-22'),
      item('2026-10-22'),
      item('2026-10-22'),
      item('2026-10-24'),
      item('2026-10-26'), // next week
    ];
    const week = weekLoad(loadByDay(items), day('2026-10-19'));
    expect(week.due).toBe(7);
    expect(week.level).toBe('busy');
    expect(week.heaviest?.day).toEqual(day('2026-10-22'));
    expect(summariseWeek(week)).toBe('Busy week · 7 due · heaviest Thu');
    expect(summariseWeek(week, true)).toBe('This week: busy · 7 due · heaviest Thu');
  });

  it('keeps a light week quiet and hides an empty one', () => {
    const light = weekLoad(loadByDay([item('2026-10-20'), item('2026-10-23')]), day('2026-10-19'));
    expect(summariseWeek(light)).toBe('Light week · 2 due');
    expect(summariseWeek(weekLoad(new Map(), day('2026-10-19')))).toBeNull();
  });

  it('picks the earliest of equally heavy days', () => {
    const week = weekLoad(
      loadByDay([item('2026-10-23'), item('2026-10-23'), item('2026-10-20'), item('2026-10-20')]),
      day('2026-10-19'),
    );
    expect(week.heaviest?.day).toEqual(day('2026-10-20'));
  });
});
