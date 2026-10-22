import { describe, expect, it } from 'vitest';
import { onDate, type CalendarEntry } from './Calendar';

const entry = (start: string, end: string | null, allDay = false): CalendarEntry => ({
  key: 'e',
  title: 'Reading week',
  start: new Date(start),
  end: end ? new Date(end) : null,
  allDay,
  color: '#000',
  kind: 'event',
  done: false,
  url: null,
  item: null,
});
const day = (d: string) => new Date(`${d}T00:00:00`);

describe('calendar placement', () => {
  it('shows a multi-day event on every day it covers', () => {
    const e = entry('2026-10-26T00:00:00', '2026-10-31T00:00:00', true);
    expect(onDate(e, day('2026-10-25'))).toBe(false);
    for (const d of ['2026-10-26', '2026-10-27', '2026-10-30'])
      expect(onDate(e, day(d))).toBe(true);
    // Ending at midnight doesn't put it on the next day.
    expect(onDate(e, day('2026-10-31'))).toBe(false);
  });

  it('puts a timed event that runs past midnight on both days', () => {
    const e = entry('2026-10-26T22:00:00', '2026-10-27T02:00:00');
    expect(onDate(e, day('2026-10-26'))).toBe(true);
    expect(onDate(e, day('2026-10-27'))).toBe(true);
    expect(onDate(e, day('2026-10-28'))).toBe(false);
  });

  it('puts a deadline on its own day only', () => {
    const d = entry('2026-10-26T23:59:00', null);
    expect(onDate(d, day('2026-10-26'))).toBe(true);
    expect(onDate(d, day('2026-10-27'))).toBe(false);
  });
});
