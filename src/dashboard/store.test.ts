import { beforeEach, describe, expect, it } from 'vitest';
import { bottomOf, DASHBOARD_VERSION, migrateDashboard, sanitize, useDashboard } from './store';

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
