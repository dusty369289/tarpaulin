import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixtureTransport } from '../canvas/transport';
import { bundleWith, plannerItem } from '../test/fixtures';
import { renderWidget } from '../test/widgets';
import { defaultSettings } from './registry';

// The Calendar's load shading and week summary, against a made-up planner: Wednesday 21 October
// 2026, weeks starting Monday 19.

const NOW = new Date(2026, 9, 21, 12);

/** A planner item due on 2026-10-`day` at noon local time. */
const planned = (day: number, opts: Parameters<typeof plannerItem>[1] = {}) =>
  plannerItem(new Date(2026, 9, day, 12), opts);

const PLANNER = [
  // Monday: unfinished, but in the past, so overdue rather than load.
  planned(19),
  // Wednesday (today): one thing (light).
  planned(21),
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

function show(settings: Record<string, unknown>, planner: unknown[] = PLANNER) {
  const transport = new FixtureTransport(
    bundleWith({ '/api/v1/planner/items': planner, '/api/v1/calendar_events': [] }),
  );
  renderWidget('calendar', settings, { transport });
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

    const wed = screen.getByRole('button', { name: /^Wednesday 21 October/ });
    expect(wed).toHaveAccessibleName('Wednesday 21 October, 1 item, light: 1 due, 10 points');
    expect(wed.querySelector('.cal-load')).toHaveAttribute('data-load', 'light');
  });

  it('leaves days with nothing due (or only finished work) unshaded', async () => {
    show({ view: 'month' });
    const fri = await screen.findByRole('button', { name: 'Friday 23 October, 1 item' });
    expect(fri).not.toHaveAttribute('title');
    expect(fri).not.toHaveAttribute('data-load');
    expect(fri.querySelector('.cal-load')).toBeNull();
    const tue = screen.getByRole('button', { name: /^Tuesday 20 October/ });
    expect(tue.querySelector('.cal-load')).toBeNull();
    // A past day's unfinished work is overdue, not load.
    const mon = screen.getByRole('button', { name: 'Monday 19 October, 1 item' });
    expect(mon.querySelector('.cal-load')).toBeNull();
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
    show({ view: 'week' }, [planned(19), planned(22), planned(23, { points: null })]);
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
