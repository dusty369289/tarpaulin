import { describe, expect, it } from 'vitest';
import { utcOffset, zonesDiffer } from './TimeZoneNote';

describe('time zone note', () => {
  const winter = new Date('2026-01-15T12:00:00Z');
  const summer = new Date('2026-07-15T12:00:00Z');

  it('reads UTC offsets, with summer time', () => {
    expect(utcOffset('UTC', winter)).toBe(0);
    expect(utcOffset('Europe/London', summer)).toBe(60);
    expect(utcOffset('America/New_York', winter)).toBe(-300);
    expect(utcOffset('Asia/Kolkata', winter)).toBe(330);
    expect(utcOffset('Not/AZone', winter)).toBeNull();
  });

  it('compares the clock time, not the zone names', () => {
    expect(zonesDiffer('Europe/Paris', 'Europe/Berlin', summer)).toBe(false);
    expect(zonesDiffer('Europe/London', 'UTC', winter)).toBe(false);
    expect(zonesDiffer('Europe/London', 'UTC', summer)).toBe(true);
    expect(zonesDiffer('America/New_York', 'Europe/London', winter)).toBe(true);
    expect(zonesDiffer('Not/AZone', 'UTC', winter)).toBe(false);
  });
});
