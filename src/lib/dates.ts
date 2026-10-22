import {
  differenceInCalendarDays,
  format,
  formatDistanceStrict,
  isSameYear,
  isValid,
  parseISO,
} from 'date-fns';
import { useSyncExternalStore } from 'react';
import { useSettings } from '../app/settingsStore';

// Times show in the computer's time zone unless the user picks Canvas's (settings `timesIn`).
// Then every Canvas time and every "now" is moved to a Date whose local fields read the wall
// clock in that zone, so date-fns formatting and day buckets ("Today", the calendar grid) work
// unchanged. Differences between two such Dates stay right except across a DST change.
// CatalogProvider (canvas/hooks.ts) sets the zone; models.ts reads times through toDate.

let displayZone: string | null = null;
const zoneListeners = new Set<() => void>();

/** null means the computer's own zone. */
export function setDisplayZone(zone: string | null) {
  if (zone === displayZone) return;
  displayZone = zone;
  for (const l of zoneListeners) l();
}

const subscribeZone = (l: () => void) => {
  zoneListeners.add(l);
  return () => zoneListeners.delete(l);
};
export const getDisplayZone = () => displayZone;
export const useDisplayZone = () => useSyncExternalStore(subscribeZone, getDisplayZone);

const wallClocks = new Map<string, Intl.DateTimeFormat>();

/** The instant `d` as wall-clock time in `zone`, read through local fields. Unknown zones and
 *  invalid dates come back unchanged. */
export function inZone(d: Date, zone: string): Date {
  let f = wallClocks.get(zone);
  try {
    f ??= new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
  } catch {
    return d;
  }
  wallClocks.set(zone, f);
  if (!isValid(d)) return d;
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(d)) p[part.type] = Number(part.value);
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, d.getMilliseconds());
}

/** `d` in the display zone. */
export const zoned = (d: Date): Date => (displayZone ? inZone(d, displayZone) : d);
export const nowInZone = (): Date => zoned(new Date());

/** Parses a Canvas time. Date-only values ("2026-10-22", all-day events) have no zone to move. */
export function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = parseISO(iso);
  if (!isValid(d)) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? d : zoned(d);
}

export function systemUses24h(): boolean {
  try {
    const cycle = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions()
      .hourCycle;
    return cycle === 'h23' || cycle === 'h24';
  } catch {
    return true;
  }
}

export function useTimeFormat(): string {
  const clock = useSettings((s) => s.clock);
  const use24 = clock === '24h' || (clock === 'auto' && systemUses24h());
  return use24 ? 'HH:mm' : 'h:mm a';
}

/** "Today 14:00", "Tomorrow 09:00", "Fri 12:00", "12 Nov", "12 Nov 2027". */
export function formatDue(date: Date, now: Date, timeFmt = 'HH:mm'): string {
  const days = differenceInCalendarDays(date, now);
  const time = format(date, timeFmt);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days === -1) return `Yesterday ${time}`;
  if (days > 1 && days < 7) return `${format(date, 'EEE')} ${time}`;
  return format(date, isSameYear(date, now) ? 'd MMM' : 'd MMM yyyy');
}

export function relative(date: Date, now: Date): string {
  const s = formatDistanceStrict(date, now, { roundingMethod: 'floor' });
  return date >= now ? `in ${s}` : `${s} ago`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago": how old cached data is. */
export function updatedAgo(at: number, now = Date.now()): string {
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}
