import {
  differenceInCalendarDays,
  format,
  formatDistanceStrict,
  isSameYear,
  isValid,
  parseISO,
} from 'date-fns';
import { useSettings } from '../app/settingsStore';

export function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return isValid(d) ? d : null;
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
