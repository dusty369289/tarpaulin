import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WidgetHost } from '../dashboard/WidgetHost';
import { FixtureTransport, type FixtureBundle } from '../canvas/transport';
import { fixtureBundle, renderWithCanvas } from '../test/render';
import { defaultSettings } from './registry';

// The Calendar's load shading and week summary, against a made-up planner: Wednesday 21 October
// 2026, weeks starting Monday 19.

const NOW = new Date(2026, 9, 21, 12);
const COURSE = 1031;
let n = 0;

/** A planner item due on 2026-10-`day` at noon local time. */
function planned(
  day: number,
  opts: { type?: string; points?: number | null; submitted?: boolean; title?: string } = {},
) {
  const id = 5000 + ++n;
  const due = new Date(2026, 9, day, 12).toISOString();
  const type = opts.type ?? 'assignment';
  const gradeable = type !== 'calendar_event' && type !== 'announcement';
  return {
    context_type: 'Course',
    course_id: COURSE,
    plannable_id: id,
    planner_override: null,
    plannable_type: type,
    new_activity: false,
    submissions: gradeable
      ? {
          submitted: opts.submitted ?? false,
          excused: false,
          graded: false,
          late: false,
          missing: false,
          needs_grading: false,
          has_feedback: false,
          redo_request: false,
        }
      : false,
    plannable_date: due,
    plannable: {
      id,
      title: opts.title ?? `Item ${id}`,
      points_possible: opts.points === undefined ? 10 : opts.points,
      due_at: gradeable ? due : null,
      start_at: gradeable ? null : due,
    },
    html_url: `/courses/${COURSE}/assignments/${id}`,
    context_name: 'Course B1',
  };
}

const PLANNER = [
  // Monday: one thing (light).
  planned(19),
  // Thursday: three things, 120 points (busy). The planner's copy of a lecture doesn't count.
  planned(22, { points: 40 }),
  planned(22, { points: 40 }),
  planned(22, { points: 40 }),
  planned(22, { type: 'calendar_event', points: null, title: 'Lecture' }),
  // Friday: submitted already, so not load.
  planned(23, { submitted: true }),
  // Saturday: three more (busy, but Thursday comes first).
  planned(24, { points: 40 }),
  planned(24, { points: 40 }),
  planned(24, { points: 40 }),
];

function transport(planner: unknown[] = PLANNER) {
  const bundle: FixtureBundle = {
    ...fixtureBundle,
    responses: {
      ...fixtureBundle.responses,
      '/api/v1/planner/items': planner,
      '/api/v1/calendar_events': [],
    },
  };
  return new FixtureTransport(bundle);
}

function show(settings: Record<string, unknown>, planner?: unknown[]) {
  renderWithCanvas(
    <WidgetHost
      id="cal"
      instance={{ type: 'calendar', settings: { ...defaultSettings('calendar'), ...settings } }}
      size={{ w: 12, h: 12 }}
      editMode={false}
      onData={() => {}}
    />,
    transport(planner),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('Calendar load (month view)', () => {
  it('shades busy days and says so in their label and tooltip', async () => {
    show({ view: 'month' });
    const thu = await screen.findByRole('button', {
      name: 'Thursday 22 October, 3 items, busy: 3 due, 120 points',
    });
    expect(thu).toHaveAttribute('title', 'Busy: 3 due, 120 points');
    expect(thu).toHaveAttribute('data-load', 'busy');
    expect(thu.querySelector('.cal-load')).toHaveAttribute('data-load', 'busy');

    const mon = screen.getByRole('button', { name: /^Monday 19 October/ });
    expect(mon).toHaveAccessibleName('Monday 19 October, 1 item, light: 1 due, 10 points');
    expect(mon.querySelector('.cal-load')).toHaveAttribute('data-load', 'light');
  });

  it('leaves days with nothing due (or only finished work) unshaded', async () => {
    show({ view: 'month' });
    const fri = await screen.findByRole('button', { name: 'Friday 23 October, 1 item' });
    expect(fri).not.toHaveAttribute('title');
    expect(fri).not.toHaveAttribute('data-load');
    expect(fri.querySelector('.cal-load')).toBeNull();
    const tue = screen.getByRole('button', { name: /^Tuesday 20 October/ });
    expect(tue.querySelector('.cal-load')).toBeNull();
  });

  it('sums up the current week in the header', async () => {
    show({ view: 'month' });
    expect(await screen.findByText('This week: busy · 7 due · heaviest Thu')).toBeInTheDocument();
  });
});

describe('Calendar load (week view)', () => {
  it('shades day columns and sums up the visible week', async () => {
    show({ view: 'week' });
    expect(await screen.findByText('Busy week · 7 due · heaviest Thu')).toBeInTheDocument();
    const thu = await screen.findByRole('region', {
      name: 'Thursday 22 October, busy: 3 due, 120 points',
    });
    expect(thu.querySelector('.cal-load')).toHaveAttribute('data-load', 'busy');
    expect(thu.querySelector('h3')).toHaveAttribute('title', 'Busy: 3 due, 120 points');
    expect(
      screen.getByRole('region', { name: 'Tuesday 20 October' }).querySelector('.cal-load'),
    ).toBeNull();
  });

  it('keeps a light week quiet', async () => {
    show({ view: 'week' }, [planned(20), planned(23, { points: null })]);
    const line = await screen.findByText('Light week · 2 due');
    expect(line.closest('p')).toHaveClass('text-muted');
  });

  it('hides the summary when nothing is due', async () => {
    show({ view: 'week' }, [planned(22, { submitted: true, title: 'Essay' })]);
    await screen.findByText('Essay');
    expect(screen.queryByText(/ week · /)).toBeNull();
    expect(document.querySelector('.cal-load')).toBeNull();
  });
});

describe('Calendar load setting', () => {
  it('turns the shading and summary off', async () => {
    show({ view: 'month', showLoad: false });
    const thu = await screen.findByRole('button', { name: 'Thursday 22 October, 3 items' });
    expect(thu).not.toHaveAttribute('title');
    await waitFor(() => expect(document.querySelector('.cal-load')).toBeNull());
    expect(screen.queryByText(/This week/)).toBeNull();
  });

  it('defaults to on', () => {
    expect(defaultSettings('calendar')).toMatchObject({ showLoad: true });
  });
});
