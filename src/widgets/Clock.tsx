import { addDays, format } from 'date-fns';
import { Clock as ClockIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { z } from 'zod';
import { useCourseIds, useNow, useProfile, useUpcoming } from '../canvas/hooks';
import { field } from './settings/fields';
import { defineWidget } from './types';
import { useTimeFormat } from '../lib/dates';
import { plural } from '../lib/text';

const schema = z.object({
  showGreeting: field(z.boolean().default(true), { label: 'Show greeting' }),
  name: field(z.string().max(40).default(''), {
    label: 'Name to greet',
    help: 'Defaults to your Canvas first name.',
  }),
  showTime: field(z.boolean().default(true), { label: 'Show time' }),
  showSeconds: field(z.boolean().default(false), { label: 'Show seconds' }),
  showDate: field(z.boolean().default(true), { label: 'Show date' }),
  showSummary: field(z.boolean().default(true), { label: 'Show “due this week” summary' }),
  align: field(z.enum(['left', 'center']).default('left'), { label: 'Alignment' }),
});

export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export const Clock = defineWidget({
  type: 'clock',
  name: 'Clock & greeting',
  description: 'The time, the date, a greeting and how much is due this week.',
  icon: ClockIcon,
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 2, h: 2 },
  settingsSchema: schema,
  Component: function ClockWidget({ settings }) {
    const now = useNow(settings.showSeconds ? 1000 : 10_000);
    const profile = useProfile();
    const timeFmt = useTimeFormat();
    const ids = useCourseIds([]);
    const deadlines = useUpcoming(7);
    const name = settings.name || profile.data?.shortName?.split(' ')[0] || '';
    const fmt = settings.showSeconds ? timeFmt.replace('mm', 'mm:ss') : timeFmt;
    const time = format(now, fmt);

    const due = deadlines.data.work().undone().inCourses(ids).between(now, addDays(now, 7)).length;

    // The layout (stacked, side by side, or one line) follows the widget's shape: see `.clock`
    // in index.css.
    return (
      <div className="fit-box">
        <div className="clock" data-align={settings.align}>
          {settings.showGreeting && (
            <div className="clock-greet truncate font-medium">
              {greeting(now)}
              {name && `, ${name}`}
            </div>
          )}
          {settings.showTime && (
            <div
              className="fit-time clock-time whitespace-nowrap font-semibold tabular-nums tracking-tight"
              style={{ '--chars': time.length } as CSSProperties}
            >
              {time}
            </div>
          )}
          {settings.showDate && (
            <div className="clock-date truncate text-muted">{format(now, 'EEEE d MMMM')}</div>
          )}
          {settings.showSummary && deadlines.query.data !== undefined && (
            <div className="clock-sum truncate text-muted">
              {due === 0
                ? 'Nothing due in the next 7 days.'
                : `${plural(due, 'thing')} due in the next 7 days.`}
            </div>
          )}
        </div>
      </div>
    );
  },
});
