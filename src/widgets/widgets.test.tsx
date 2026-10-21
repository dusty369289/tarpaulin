import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Catalog } from '../canvas/models';
import { FixtureTransport, type FixtureBundle } from '../canvas/transport';
import type { CourseData, PlannerItemData } from '../canvas/types';
import * as R from '../canvas/resources';
import { CanvasClient } from '../canvas/client';
import { buildPage, PRESETS } from '../dashboard/presets';
import { WidgetHost } from '../dashboard/WidgetHost';
import { fixtureBundle, recordedAt, renderWithCanvas } from '../test/render';
import { selectDueSoon } from './DueSoon';
import { defaultSettings, widgetRegistry } from './registry';

// Widgets run against anonymised responses recorded from a real Canvas account, with the clock
// frozen at the moment of recording.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(recordedAt);
});
afterEach(() => vi.useRealTimers());

async function fixtureCatalog() {
  const client = new CanvasClient(new FixtureTransport(fixtureBundle), fixtureBundle.meta.baseUrl);
  const courses: CourseData[] = await client.fetch(R.Courses);
  const planner: PlannerItemData[] = await client.fetch(R.Planner('2000-01-01', '2100-01-01'));
  const prefs = {
    courseScope: 'current' as const,
    hiddenCourseIds: [],
    courseColors: {},
    courseNicknames: {},
  };
  return { catalog: new Catalog({ courses, prefs, now: recordedAt }), planner };
}

describe('selectDueSoon (recorded fixtures)', () => {
  const opts = {
    daysAhead: 30,
    overdueDays: 7,
    include: 'work' as const,
    showCompleted: false,
    sortBy: 'due' as const,
    maxItems: 50,
  };

  it('lists outstanding work in due order, never announcements', async () => {
    const { catalog, planner } = await fixtureCatalog();
    const items = selectDueSoon(
      catalog.deadlines(planner),
      opts,
      catalog.inScope.ids(),
      recordedAt,
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((d) => d.isAnnouncement)).toBe(false);
    expect(items.every((d) => d.isWork && !d.isDone)).toBe(true);
    const times = items.map((d) => d.date!.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    const horizon = recordedAt.getTime() + 31 * 86_400_000;
    expect(times.every((t) => t < horizon && t > recordedAt.getTime() - 8 * 86_400_000)).toBe(true);
  });

  it('respects the course filter, overdue window and max items', async () => {
    const { catalog, planner } = await fixtureCatalog();
    const all = catalog.deadlines(planner);
    const some = catalog.inScope.ids().slice(0, 1);
    expect(
      selectDueSoon(all, opts, some, recordedAt).every(
        (d) => !d.courseId || some.includes(d.courseId),
      ),
    ).toBe(true);
    expect(
      selectDueSoon(all, { ...opts, overdueDays: 0 }, null, recordedAt).every(
        (d) => d.date! >= recordedAt,
      ),
    ).toBe(true);
    expect(
      selectDueSoon(all, { ...opts, maxItems: 1 }, null, recordedAt).length,
    ).toBeLessThanOrEqual(1);
  });
});

describe('every widget', () => {
  it.each(Object.keys(widgetRegistry))(
    '%s has complete defaults and renders at its minimum size',
    async (type) => {
      const def = widgetRegistry[type];
      const settings = defaultSettings(type);
      expect(settings).toMatchObject({ title: '', density: 'comfortable' });
      renderWithCanvas(
        <WidgetHost
          id="t"
          instance={{ type, settings }}
          size={def.minSize}
          editMode={false}
          onData={() => {}}
        />,
      );
      const frame = await screen.findByTestId('widget-frame');
      await waitFor(() => expect(within(frame).queryByRole('status')).toBeNull());
      expect(within(frame).queryByText(/hit a problem/)).toBeNull();
    },
  );
});

describe('Due soon widget', () => {
  it('shows recorded deadlines with course names', async () => {
    renderWithCanvas(
      <WidgetHost
        id="d"
        instance={{ type: 'due-soon', settings: defaultSettings('due-soon') }}
        size={{ w: 4, h: 9 }}
        editMode={false}
        onData={() => {}}
      />,
    );
    const items = await screen.findAllByTestId('due-item');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].textContent).toMatch(/Course [A-Z]/);
  });
});

describe('caching', () => {
  it('a whole preset dashboard makes one planner request and fetches each resource once', async () => {
    const transport = new FixtureTransport(fixtureBundle as FixtureBundle);
    const page = buildPage(PRESETS[0]);
    renderWithCanvas(
      <>
        {page.layout.map((l) => (
          <WidgetHost
            key={l.i}
            id={l.i}
            instance={page.widgets[l.i]}
            size={{ w: l.w, h: l.h }}
            editMode={false}
            onData={() => {}}
          />
        ))}
      </>,
      transport,
    );
    await screen.findAllByTestId('due-item');
    await waitFor(() => expect(screen.queryAllByRole('status')).toHaveLength(0));
    const counts = new Map<string, number>();
    for (const r of transport.requests) counts.set(r.path, (counts.get(r.path) ?? 0) + 1);
    expect(counts.get('/api/v1/planner/items')).toBe(1);
    expect(Object.fromEntries([...counts].filter(([, n]) => n > 1))).toEqual({});
  });
});
