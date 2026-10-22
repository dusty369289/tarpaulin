import { beforeEach, describe, expect, it } from 'vitest';
import { useSettings } from '../app/settingsStore';
import {
  bottomOf,
  DASHBOARD_VERSION,
  migrateDashboard,
  sanitize,
  UNDO_LIMIT,
  useDashboard,
} from './store';

describe('dashboard persistence migrations', () => {
  it('upgrades v1 (widgets as an array, no icons) to the current shape', () => {
    const v1 = {
      activePageId: 'p1',
      pages: [
        {
          id: 'p1',
          name: 'Home',
          layout: [
            { i: 'w1', x: 0, y: 0, w: 4, h: 6 },
            { i: 'w2', x: 4, y: 0, w: 4, h: 6 },
          ],
          widgets: [
            { id: 'w1', type: 'due-soon', settings: { daysAhead: 3 } },
            { id: 'w2', type: 'retired-widget' },
          ],
        },
      ],
    };
    const out = migrateDashboard(v1, 1);
    expect(DASHBOARD_VERSION).toBe(2);
    expect(out.activePageId).toBe('p1');
    const page = out.pages[0];
    expect(page.icon).toBe('layout-dashboard');
    expect(Object.keys(page.widgets)).toEqual(['w1']); // unknown types are dropped…
    expect(page.layout.map((l) => l.i)).toEqual(['w1']); // …with their layout entries
    expect(page.widgets.w1.settings).toMatchObject({ daysAhead: 3, groupBy: 'day', title: '' }); // defaults filled in
  });

  it('repairs invalid settings field by field instead of resetting the widget', () => {
    const out = sanitize({
      pages: [
        {
          id: 'p',
          name: 'P',
          icon: 'star',
          layout: [],
          widgets: { a: { type: 'due-soon', settings: { daysAhead: 'lots', maxItems: 5 } } },
        },
      ],
    });
    expect(out.pages[0].widgets.a.settings).toMatchObject({ daysAhead: 14, maxItems: 5 });
    expect(out.pages[0].layout).toHaveLength(1); // missing layout entry recreated
  });

  it('falls back to a starter page when nothing valid is stored', () => {
    expect(sanitize({}).pages).toHaveLength(1);
    expect(sanitize({ pages: 'nope' }).pages[0].layout.length).toBeGreaterThan(0);
  });
});

describe('dashboard actions', () => {
  beforeEach(() => useDashboard.setState(useDashboard.getInitialState()));

  it('adds widgets at the bottom, duplicates, updates and removes them', () => {
    const s = useDashboard.getState();
    const page = s.pages[0];
    const bottom = bottomOf(page.layout);
    const id = s.addWidget(page.id, 'notes')!;
    let current = useDashboard.getState().pages[0];
    expect(current.layout.find((l) => l.i === id)).toMatchObject({ x: 0, y: bottom });

    useDashboard
      .getState()
      .updateWidgetSettings(page.id, id, { title: 'Ideas', fontSize: 'large' });
    current = useDashboard.getState().pages[0];
    expect(current.widgets[id].settings).toMatchObject({
      title: 'Ideas',
      fontSize: 'large',
      monospace: false,
    });

    useDashboard.getState().duplicateWidget(page.id, id);
    current = useDashboard.getState().pages[0];
    expect(Object.values(current.widgets).filter((w) => w.settings.title === 'Ideas')).toHaveLength(
      2,
    );

    useDashboard.getState().removeWidget(page.id, id);
    current = useDashboard.getState().pages[0];
    expect(current.widgets[id]).toBeUndefined();
    expect(current.layout.some((l) => l.i === id)).toBe(false);
  });

  it('rejects unknown widget types and keeps at least one page', () => {
    const s = useDashboard.getState();
    expect(s.addWidget(s.pages[0].id, 'nope')).toBeNull();
    s.deletePage(s.pages[0].id);
    expect(useDashboard.getState().pages).toHaveLength(1);
  });

  it('adds preset pages and switches to them', () => {
    const id = useDashboard.getState().addPage('minimal');
    const s = useDashboard.getState();
    expect(s.activePageId).toBe(id);
    expect(s.pages.find((p) => p.id === id)?.name).toBe('Minimal');
  });
});

describe('page and widget styles', () => {
  beforeEach(() => {
    useDashboard.setState(sanitize({}));
  });
  const page = () => useDashboard.getState().pages[0];

  it('sets and clears a page look', () => {
    const { setPageLook } = useDashboard.getState();
    setPageLook(page().id, { background: 'cork', widgetStyle: 'postit' });
    expect(page()).toMatchObject({ background: 'cork', widgetStyle: 'postit' });
    setPageLook(page().id, { background: '' });
    expect(page().background).toBeUndefined();
    expect(page().widgetStyle).toBe('postit');
  });

  it('applies a style to every widget on a page, clearing overrides', () => {
    const s = useDashboard.getState();
    const [first] = Object.keys(page().widgets);
    s.updateWidgetSettings(page().id, first, {
      ...page().widgets[first].settings,
      style: 'terminal',
      paper: 'amber',
    });
    expect(page().widgets[first].settings).toMatchObject({ style: 'terminal', paper: 'amber' });
    s.applyWidgetStyle(page().id, 'swiss');
    expect(page().widgetStyle).toBe('swiss');
    for (const w of Object.values(page().widgets))
      expect(w.settings).toMatchObject({ style: '', paper: 'auto' });
  });

  it('applies a style everywhere by clearing page defaults too', () => {
    const s = useDashboard.getState();
    s.setPageLook(page().id, { widgetStyle: 'pixel', background: 'night-sky' });
    s.applyWidgetStyle(null, 'journal');
    expect(page().widgetStyle).toBeUndefined();
    expect(page().background).toBe('night-sky');
    s.clearPageBackgrounds();
    expect(page().background).toBeUndefined();
  });

  it('keeps page looks through sanitize', () => {
    const out = sanitize({
      pages: [{ id: 'p', name: 'P', layout: [], widgets: {}, background: 'dots', widgetStyle: 7 }],
    });
    expect(out.pages[0].background).toBe('dots');
    expect(out.pages[0].widgetStyle).toBeUndefined();
  });
});

describe('undo', () => {
  beforeEach(() => {
    useDashboard.setState({ ...sanitize({}), undoStack: [] });
    useSettings.setState({ background: 'plain', widgetStyle: 'card' });
  });
  const page = () => useDashboard.getState().pages[0];
  // Changes in one task share an entry, so tests step past the task between "clicks".
  const nextClick = () => new Promise<void>((r) => setTimeout(r, 0));

  it('puts back a removed widget with its data and place', async () => {
    const s = useDashboard.getState();
    const id = s.addWidget(page().id, 'notes')!;
    s.setWidgetData(page().id, id, { text: 'Remember the milk' });
    s.updateWidgetSettings(page().id, id, { title: 'Ideas' });
    const before = page();
    await nextClick();
    s.removeWidget(page().id, id);
    expect(page().widgets[id]).toBeUndefined();
    expect(useDashboard.getState().undoStack[0].label).toBe('Removed Ideas');
    useDashboard.getState().undo();
    expect(page()).toEqual(before);
    expect(useDashboard.getState().undoStack).toHaveLength(0);
  });

  it('puts back a deleted page and makes it active again', async () => {
    const s = useDashboard.getState();
    const first = page().id;
    const second = s.addPage('minimal');
    await nextClick();
    s.deletePage(second);
    expect(useDashboard.getState().activePageId).toBe(first);
    expect(useDashboard.getState().undoStack[0].label).toBe('Deleted “Minimal”');
    useDashboard.getState().undo();
    expect(useDashboard.getState().pages.map((p) => p.id)).toEqual([first, second]);
    expect(useDashboard.getState().activePageId).toBe(second);
  });

  it('undoes a widget reset', async () => {
    const s = useDashboard.getState();
    const [id] = Object.keys(page().widgets);
    s.updateWidgetSettings(page().id, id, { ...page().widgets[id].settings, title: 'Mine' });
    await nextClick();
    s.resetWidgetSettings(page().id, id);
    expect(page().widgets[id].settings.title).toBe('');
    useDashboard.getState().undo();
    expect(page().widgets[id].settings.title).toBe('Mine');
  });

  it('treats a look picked in one click as one change, app look included', async () => {
    const s = useDashboard.getState();
    const [id] = Object.keys(page().widgets);
    s.setPageLook(page().id, { background: 'cork' });
    s.updateWidgetSettings(page().id, id, { ...page().widgets[id].settings, style: 'pixel' });
    const before = page();
    await nextClick();
    // What Settings › Look does: the app look first, then every page.
    useSettings.getState().update({ background: 'night-sky', widgetStyle: 'terminal' });
    s.applyWidgetStyle(null, 'terminal');
    s.clearPageBackgrounds();
    expect(useDashboard.getState().undoStack).toHaveLength(1);
    expect(useDashboard.getState().undoStack[0].label).toBe('Changed the look of every page');
    useDashboard.getState().undo();
    expect(page()).toEqual(before);
    expect(useSettings.getState()).toMatchObject({ background: 'plain', widgetStyle: 'card' });
  });

  it('records nothing when a change changes nothing, and keeps the newest few', async () => {
    const s = useDashboard.getState();
    s.clearPageBackgrounds();
    s.deletePage(page().id); // the last page stays
    expect(useDashboard.getState().undoStack).toHaveLength(0);
    for (let i = 0; i < UNDO_LIMIT + 3; i++) {
      s.addWidget(page().id, 'clock');
      await nextClick();
      s.removeWidget(page().id, page().layout.at(-1)!.i);
      await nextClick();
    }
    expect(useDashboard.getState().undoStack).toHaveLength(UNDO_LIMIT);
  });

  it('is never persisted', () => {
    useDashboard.getState().removeWidget(page().id, page().layout[0].i);
    const saved = JSON.parse(localStorage.getItem('tarpaulin.dashboard') ?? '{}');
    expect(saved.state.undoStack).toBeUndefined();
  });
});

describe('keyboard moves', () => {
  beforeEach(() => useDashboard.setState({ ...sanitize({}), undoStack: [] }));
  const page = () => useDashboard.getState().pages[0];

  it('moves and resizes within the grid and stops at its edges', () => {
    const s = useDashboard.getState();
    const id = page().layout.find((l) => l.x === 0 && l.y === 0)!.i;
    expect(s.nudgeWidget(page().id, id, { dx: -1 })).toBeNull();
    const moved = s.nudgeWidget(page().id, id, { dx: 1 })!;
    expect(moved.x).toBe(1);
    expect(page().layout.find((l) => l.i === id)).toMatchObject({ x: 1 });
    const grown = s.nudgeWidget(page().id, id, { dh: 1 })!;
    expect(grown.h).toBe(moved.h + 1);
    expect(s.nudgeWidget(page().id, 'missing', { dx: 1 })).toBeNull();
  });
});
