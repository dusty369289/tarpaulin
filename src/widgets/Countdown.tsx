import { intervalToDuration } from 'date-fns';
import { Hourglass } from 'lucide-react';
import type { CSSProperties } from 'react';
import { z } from 'zod';
import { useCanvas } from '../canvas/CanvasProvider';
import { useCourseIds, useNow, useUpcoming } from '../canvas/hooks';
import { formatDue, toDate, useTimeFormat } from '../lib/dates';
import { courseFilter, field } from './settings/fields';
import { QueryGate } from './shared/ui';
import { defineWidget } from './types';

const schema = z.object({
  target: field(z.enum(['next-deadline', 'custom']).default('next-deadline'), {
    label: 'Count down to',
    options: { 'next-deadline': 'Next Canvas deadline', custom: 'A date I choose' },
  }),
  courseIds: courseFilter(),
  customLabel: field(z.string().max(60).default('Exams start'), { label: 'Custom label' }),
  customDate: field(z.string().default(''), { label: 'Custom date & time', kind: 'datetime' }),
  showSeconds: field(z.boolean().default(false), { label: 'Show seconds' }),
  urgentHours: field(z.number().int().min(0).max(168).default(24), {
    label: 'Turn red when under',
    unit: 'hours',
  }),
});

/** Rough width of each unit label in em, at full size (they're shown at 0.45em). */
const UNIT_EM: Record<string, number> = { y: 0.6, mo: 1.5, d: 0.65, h: 0.65, m: 0.95, s: 0.55 };

export const Countdown = defineWidget({
  type: 'countdown',
  name: 'Countdown',
  description: 'A big, live countdown to your next deadline or a date you pick.',
  icon: Hourglass,
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 2, h: 2 },
  settingsSchema: schema,
  Component: function CountdownWidget({ settings, size }) {
    const now = useNow(settings.showSeconds ? 1000 : 15_000);
    const ids = useCourseIds(settings.courseIds);
    const deadlines = useUpcoming(60);
    const { openLink } = useCanvas();
    const timeFmt = useTimeFormat();

    const render = (label: string, target: Date | null, sub?: string, onClick?: () => void) => {
      if (!target)
        return (
          // Fit-to-box like the digits, so it reads at 2×2 as well as 8×6.
          <div className="fit-box items-center text-center">
            <p className="fit-line line-clamp-3 max-w-full text-muted">
              {settings.target === 'custom'
                ? 'Pick a date in settings.'
                : 'No upcoming deadlines. Enjoy it.'}
            </p>
          </div>
        );
      const past = target <= now;
      const d = intervalToDuration({ start: now, end: past ? now : target });
      const hoursLeft = (target.getTime() - now.getTime()) / 3_600_000;
      const urgent = !past && settings.urgentHours > 0 && hoursLeft < settings.urgentHours;
      const units: Array<[number, string]> = [
        [d.years ?? 0, 'y'],
        [d.months ?? 0, 'mo'],
        [d.days ?? 0, 'd'],
        [d.hours ?? 0, 'h'],
        [d.minutes ?? 0, 'm'],
      ];
      if (settings.showSeconds) units.push([d.seconds ?? 0, 's']);
      // Drop leading zero units but keep at least the last two.
      const firstNonZero = units.findIndex(([v]) => v > 0);
      const shown = units.slice(
        Math.min(firstNonZero === -1 ? units.length - 2 : firstNonZero, units.length - 2),
      );
      // Fewer units in small widgets so the digits can stay big.
      const maxUnits = size.w <= 2 ? 2 : size.w <= 3 ? 3 : 4;
      const visible = past ? [] : shown.slice(0, maxUnits);
      // The digits' width in em, so CSS can size them to fill their share of the box.
      const digitStyle = {
        '--dchars': past ? 3 : visible.reduce((n, [v]) => n + String(v).length, 0),
        '--uem': visible.reduce((n, [, u]) => n + (UNIT_EM[u] ?? 0.7), 0),
        '--n': Math.max(1, visible.length),
      } as CSSProperties;
      // The layout (stacked, side by side, or one line) follows the widget's shape: see `.cd`
      // in index.css.
      return (
        <div className="fit-box">
          <div className="cd">
            <button
              type="button"
              onClick={onClick}
              disabled={!onClick}
              className="cd-label truncate font-medium enabled:hover:underline"
            >
              {label}
            </button>
            <div
              className={`fit-digits cd-digits flex items-baseline gap-x-[0.3em] whitespace-nowrap font-semibold tabular-nums transition-colors ${urgent ? 'text-danger' : 'text-accent'}`}
              style={digitStyle}
              aria-live="off"
            >
              {past ? (
                <span>Now</span>
              ) : (
                visible.map(([v, u]) => (
                  <span key={u} className="whitespace-nowrap">
                    {v}
                    <span className="ml-0.5 text-[0.45em] font-medium text-muted">{u}</span>
                  </span>
                ))
              )}
            </div>
            {sub && <div className="cd-sub truncate text-muted">{sub}</div>}
          </div>
        </div>
      );
    };

    if (settings.target === 'custom') {
      return render(
        settings.customLabel || 'Countdown',
        toDate(settings.customDate ? new Date(settings.customDate).toISOString() : null),
      );
    }
    return (
      <QueryGate queries={[deadlines.query]}>
        {() => {
          const next = deadlines.data.inCourses(ids).next(now);
          return render(
            next?.title ?? '',
            next?.date ?? null,
            next ? `${next.courseName} · ${formatDue(next.date!, now, timeFmt)}` : undefined,
            next ? () => openLink(next.url) : undefined,
          );
        }}
      </QueryGate>
    );
  },
});
