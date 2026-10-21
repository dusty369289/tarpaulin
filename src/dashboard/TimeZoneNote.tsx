import { Globe } from 'lucide-react';
import { useState } from 'react';
import { useProfile } from '../canvas/hooks';
import { Banner } from '../ui';

const DISMISSED_KEY = 'tarpaulin.timeZoneNote';

/** A zone's UTC offset in minutes at `at`, or null for a zone this browser doesn't know. */
export function utcOffset(timeZone: string, at: Date): number | null {
  try {
    const name =
      new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
        .formatToParts(at)
        .find((p) => p.type === 'timeZoneName')?.value ?? '';
    if (name === 'GMT') return 0;
    const m = /^GMT([+-])(\d{1,2}):?(\d{2})?$/.exec(name);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : null;
  } catch {
    return null;
  }
}

/** True when the two zones show a different clock time right now (names alone can differ). */
export function zonesDiffer(a: string, b: string, at = new Date()): boolean {
  if (a === b) return false;
  const [x, y] = [utcOffset(a, at), utcOffset(b, at)];
  return x !== null && y !== null && x !== y;
}

const readable = (zone: string) => zone.replace(/_/g, ' ');

function dismissedFor(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * Says so when the computer's clock is in a different time zone from the one set in Canvas, since
 * every due time here is shown in the computer's. Dismissing it holds until either zone changes.
 */
export function TimeZoneNote() {
  const canvasZone = useProfile().data?.timeZone ?? null;
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const pair = `${canvasZone}|${deviceZone}`;
  const [dismissed, setDismissed] = useState(dismissedFor);
  if (!canvasZone || !deviceZone || dismissed === pair || !zonesDiffer(canvasZone, deviceZone))
    return null;
  return (
    <Banner
      tone="accent"
      icon={Globe}
      testId="time-zone-note"
      dismissLabel="Dismiss time zone note"
      onDismiss={() => {
        try {
          localStorage.setItem(DISMISSED_KEY, pair);
        } catch {
          // Private windows: it just comes back next time.
        }
        setDismissed(pair);
      }}
    >
      Times are shown in your computer’s time zone ({readable(deviceZone)}). Your Canvas account
      uses {readable(canvasZone)}, so Canvas may show different times.
    </Banner>
  );
}
