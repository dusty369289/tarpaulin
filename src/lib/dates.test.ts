import { afterEach, describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import {
  atTime,
  dayKey,
  formatDay,
  formatDayTime,
  formatDue,
  inZone,
  minutesOf,
  nowInZone,
  setDisplayZone,
  toDate,
  updatedAgo,
} from './dates';

afterEach(() => setDisplayZone(null));

describe('inZone', () => {
  it('reads the wall clock in another zone', () => {
    const d = new Date('2026-10-22T23:30:00Z');
    expect(format(inZone(d, 'Asia/Tokyo'), 'yyyy-MM-dd HH:mm')).toBe('2026-10-23 08:30');
    expect(format(inZone(d, 'America/New_York'), 'yyyy-MM-dd HH:mm')).toBe('2026-10-22 19:30');
    expect(format(inZone(d, 'UTC'), 'HH:mm')).toBe('23:30');
  });

  it('keeps the gap between two times', () => {
    const a = new Date('2026-10-22T10:00:00Z');
    const b = new Date('2026-10-22T13:15:00Z');
    const zone = 'Australia/Adelaide';
    expect(inZone(b, zone).getTime() - inZone(a, zone).getTime()).toBe(195 * 60_000);
  });

  it('leaves unknown zones and invalid dates alone', () => {
    const d = new Date('2026-10-22T10:00:00Z');
    expect(inZone(d, 'Not/AZone')).toBe(d);
    expect(Number.isNaN(inZone(new Date(NaN), 'UTC').getTime())).toBe(true);
  });
});

describe('toDate with a display zone', () => {
  it('moves Canvas times into the chosen zone, and "now" with them', () => {
    setDisplayZone('Asia/Tokyo');
    expect(format(toDate('2026-10-22T23:30:00Z')!, 'yyyy-MM-dd HH:mm')).toBe('2026-10-23 08:30');
    const due = toDate('2026-10-22T23:30:00Z')!;
    // "Tomorrow" in Tokyo is decided on Tokyo's calendar.
    const now = inZone(new Date('2026-10-22T05:00:00Z'), 'Asia/Tokyo');
    expect(formatDue(due, now)).toBe('Tomorrow 08:30');
    expect(
      Math.abs(nowInZone().getTime() - inZone(new Date(), 'Asia/Tokyo').getTime()),
    ).toBeLessThan(1000);
  });

  it('leaves date-only values (all-day events) on their day', () => {
    setDisplayZone('Pacific/Kiritimati');
    expect(format(toDate('2026-10-22')!, 'yyyy-MM-dd HH:mm')).toBe('2026-10-22 00:00');
  });

  it('is a plain parse without a zone', () => {
    const iso = '2026-10-22T23:30:00Z';
    expect(toDate(iso)!.getTime()).toBe(Date.parse(iso));
    expect(toDate('garbage')).toBeNull();
    expect(toDate(null)).toBeNull();
  });
});

describe('updatedAgo', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  it.each([
    [20_000, 'just now'],
    [5 * 60_000, '5 min ago'],
    [3 * 3600_000 + 10 * 60_000, '3 h ago'],
    [26 * 3600_000, '1 day ago'],
    [5 * 86400_000, '5 days ago'],
  ])('%i ms → %s', (ms, text) => expect(updatedAgo(now - ms, now)).toBe(text));
});

describe('day names', () => {
  const now = new Date(2026, 9, 22, 12); // Thursday
  const day = (d: number, h = 14) => new Date(2026, 9, d, h);

  it('names nearby days and dates the rest', () => {
    expect(formatDay(day(22), now)).toBe('Today');
    expect(formatDay(day(23), now, { lower: true })).toBe('tomorrow');
    expect(formatDay(day(21), now)).toBe('Yesterday');
    expect(formatDay(day(26), now, { lower: true })).toBe('Mon');
    expect(formatDay(day(29), now)).toBe('29 Oct');
    expect(formatDay(new Date(2027, 0, 5), now)).toBe('5 Jan 2027');
  });

  it('adds the time to named days, and to dated ones when asked', () => {
    expect(formatDayTime(day(23), now, 'HH:mm', { lower: true })).toBe('tomorrow 14:00');
    expect(formatDayTime(day(29), now)).toBe('29 Oct');
    expect(formatDayTime(day(29), now, 'HH:mm', { timeBeyondWeek: true })).toBe('29 Oct 14:00');
    expect(formatDue(day(19), now)).toBe('19 Oct');
  });

  it('reads and writes day keys and times of day', () => {
    expect(dayKey(day(3))).toBe('2026-10-03');
    expect(minutesOf('09:30')).toBe(570);
    expect(atTime('2026-10-03', '09:30')).toEqual(new Date(2026, 9, 3, 9, 30));
  });
});
