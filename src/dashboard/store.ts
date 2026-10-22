import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useSettings } from '../app/settingsStore';
import { newId } from '../lib/id';
import { defaultSettings, getWidget, normalizeSettings } from '../widgets/registry';
import { nudgeLayout, type Nudge } from './layout';
import { buildPage, PRESETS, presetById } from './presets';
import { GRID_COLS, type LayoutItem, type Page } from './types';

export const DASHBOARD_VERSION = 2;

interface DashboardData {
  pages: Page[];
  activePageId: string;
}

/** The app-wide look (Settings), which the look picker and "All pages" change with the pages. */
interface AppLook {
  background: string;
  widgetStyle: string;
}

/** What one Undo puts back: the pages and look from just before a destructive change. */
export interface UndoEntry {
  id: number;
  /** When it happened (ms), so the toast only offers recent changes. */
  at: number;
  /** What happened, for the toast: "Removed To-do". */
  label: string;
  pages: Page[];
  activePageId: string;
  look: AppLook;
}

/** How many destructive changes can be undone, newest first. */
export const UNDO_LIMIT = 10;

interface DashboardState extends DashboardData {
  /** Not persisted: undo only covers this session. */
  undoStack: UndoEntry[];
  /** Puts back the newest entry. */
  undo: () => void;
  editMode: boolean;
  setEditMode: (on: boolean) => void;
  setActivePage: (id: string) => void;
  addPage: (presetId?: string) => string;
  renamePage: (id: string, name: string) => void;
  setPageIcon: (id: string, icon: string) => void;
  deletePage: (id: string) => void;
  movePage: (id: string, dir: -1 | 1) => void;
  setLayout: (pageId: string, layout: LayoutItem[]) => void;
  /** Keyboard move/resize of one widget; returns its new place, or null if it couldn't go. */
  nudgeWidget: (pageId: string, widgetId: string, nudge: Nudge) => LayoutItem | null;
  addWidget: (pageId: string, type: string) => string | null;
  removeWidget: (pageId: string, widgetId: string) => void;
  duplicateWidget: (pageId: string, widgetId: string) => void;
  updateWidgetSettings: (
    pageId: string,
    widgetId: string,
    settings: Record<string, unknown>,
  ) => void;
  resetWidgetSettings: (pageId: string, widgetId: string) => void;
  setWidgetData: (pageId: string, widgetId: string, data: unknown) => void;
  /** Sets or clears ('') this page's background / default widget style. */
  setPageLook: (pageId: string, look: { background?: string; widgetStyle?: string }) => void;
  /**
   * Makes `style` the style of every widget on one page (page default, widget overrides
   * cleared), or with pageId null on every page (page defaults and overrides cleared; the
   * caller sets the app default).
   */
  applyWidgetStyle: (pageId: string | null, style: string) => void;
  /** Clears every page's background override, so the app default shows everywhere. */
  clearPageBackgrounds: () => void;
  replacePages: (pages: Page[]) => void;
  appendPages: (pages: Page[]) => void;
}

export function initialDashboard(): DashboardData {
  const page = buildPage(PRESETS[0], 'Home');
  return { pages: [page], activePageId: page.id };
}

/** Lowest free row, so new widgets land at the bottom without overlapping anything. */
export function bottomOf(layout: LayoutItem[]): number {
  return layout.reduce((max, l) => Math.max(max, l.y + l.h), 0);
}

// ---------------------------------------------------------------------------------------------
// Persisted-state migrations. Each entry upgrades from version N to N+1.

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

interface PageV1 {
  id: string;
  name: string;
  layout: LayoutItem[];
  widgets: Array<{ id: string; type: string; settings?: Record<string, unknown> }>;
}

export const MIGRATIONS: Record<number, Migration> = {
  // v1 stored widgets as an array and had no page icons or widget data.
  1: (state) => {
    const pages = (state.pages as PageV1[] | undefined) ?? [];
    return {
      ...state,
      pages: pages.map((p) => ({
        id: p.id,
        name: p.name,
        icon: 'layout-dashboard',
        layout: p.layout,
        widgets: Object.fromEntries(
          p.widgets.map((w) => [w.id, { type: w.type, settings: w.settings ?? {} }]),
        ),
      })),
    };
  },
};

export function migrateDashboard(persisted: unknown, fromVersion: number): DashboardData {
  let state = (persisted ?? {}) as Record<string, unknown>;
  for (let v = fromVersion; v < DASHBOARD_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (step) state = step(state);
  }
  return sanitize(state);
}

/** Drops unknown widget types and dangling layout entries, and fills in setting defaults. */
export function sanitize(state: Record<string, unknown>): DashboardData {
  const rawPages = Array.isArray(state.pages) ? (state.pages as Page[]) : [];
  const pages: Page[] = rawPages
    .filter((p) => p && typeof p.id === 'string')
    .map((p) => {
      const widgets: Page['widgets'] = {};
      for (const [id, w] of Object.entries(p.widgets ?? {})) {
        if (w && getWidget(w.type))
          widgets[id] = { ...w, settings: normalizeSettings(w.type, w.settings) };
      }
      const layout = (p.layout ?? []).filter((l) => widgets[l.i]);
      // Widgets without a layout entry get one at the bottom.
      for (const id of Object.keys(widgets)) {
        if (!layout.some((l) => l.i === id)) {
          const def = getWidget(widgets[id].type)!;
          layout.push({ i: id, x: 0, y: bottomOf(layout), ...def.defaultSize });
        }
      }
      return {
        id: p.id,
        name: p.name || 'Page',
        icon: p.icon || 'layout-dashboard',
        ...(typeof p.background === 'string' && p.background && { background: p.background }),
        ...(typeof p.widgetStyle === 'string' && p.widgetStyle && { widgetStyle: p.widgetStyle }),
        layout,
        widgets,
      };
    });
  if (pages.length === 0) return initialDashboard();
  const active =
    typeof state.activePageId === 'string' && pages.some((p) => p.id === state.activePageId);
  return { pages, activePageId: active ? (state.activePageId as string) : pages[0].id };
}

function mapPage(pages: Page[], id: string, fn: (p: Page) => Page): Page[] {
  return pages.map((p) => (p.id === id ? fn(p) : p));
}

// ---------------------------------------------------------------------------------------------
// Undo. Destructive actions record what was there before them. One click can make several
// changes (the look picker sets the app look, every widget's style and every page background),
// so everything changed in the same task shares one snapshot, taken before the first change.

const currentLook = (): AppLook => {
  const { background, widgetStyle } = useSettings.getState();
  return { background, widgetStyle };
};
let tickSnapshot: Omit<UndoEntry, 'id' | 'at' | 'label'> | null = null;
let nextUndoId = 1;
function snapshot(data: DashboardData, look: AppLook) {
  if (!tickSnapshot) {
    tickSnapshot = { pages: data.pages, activePageId: data.activePageId, look };
    queueMicrotask(() => (tickSnapshot = null));
  }
  return tickSnapshot;
}

export const useDashboard = create<DashboardState>()(
  persist(
    (set, get) => {
      /** Runs a destructive change and, if it changed anything, offers to undo it. */
      const destructive = (
        label: string,
        change: (s: DashboardState) => Partial<DashboardState> | DashboardState,
      ) =>
        set((s) => {
          const next = change(s);
          if (next === s || !next.pages || JSON.stringify(next.pages) === JSON.stringify(s.pages))
            return next;
          const before = snapshot(s, currentLook());
          const top = s.undoStack[0];
          // Later changes in the same click join the first one's entry.
          const undoStack =
            top && top.pages === before.pages
              ? [
                  { ...top, label: top.label === label ? label : 'Changed the look of every page' },
                  ...s.undoStack.slice(1),
                ]
              : [{ id: nextUndoId++, at: Date.now(), label, ...before }, ...s.undoStack].slice(
                  0,
                  UNDO_LIMIT,
                );
          return { ...next, undoStack };
        });
      const widgetName = (p: Page | undefined, id: string) => {
        const w = p?.widgets[id];
        return (w && ((w.settings.title as string) || getWidget(w.type)?.name)) || 'widget';
      };
      return {
        ...initialDashboard(),
        undoStack: [],
        undo: () => {
          const [entry, ...rest] = get().undoStack;
          if (!entry) return;
          set({ pages: entry.pages, activePageId: entry.activePageId, undoStack: rest });
          const look = currentLook();
          if (
            look.background !== entry.look.background ||
            look.widgetStyle !== entry.look.widgetStyle
          )
            useSettings.getState().update(entry.look);
        },
        editMode: false,
        setEditMode: (on) => set({ editMode: on }),
        setActivePage: (id) => set({ activePageId: id }),
        addPage: (presetId) => {
          const preset = presetId ? presetById(presetId) : undefined;
          const page: Page = preset
            ? buildPage(preset)
            : {
                id: newId('p'),
                name: `Page ${get().pages.length + 1}`,
                icon: 'layout-dashboard',
                layout: [],
                widgets: {},
              };
          set((s) => ({ pages: [...s.pages, page], activePageId: page.id }));
          return page.id;
        },
        renamePage: (id, name) =>
          set((s) => ({
            pages: mapPage(s.pages, id, (p) => ({ ...p, name: name.trim() || p.name })),
          })),
        setPageIcon: (id, icon) =>
          set((s) => ({ pages: mapPage(s.pages, id, (p) => ({ ...p, icon })) })),
        deletePage: (id) =>
          destructive(`Deleted “${get().pages.find((p) => p.id === id)?.name ?? 'page'}”`, (s) => {
            if (s.pages.length <= 1) return s;
            const idx = s.pages.findIndex((p) => p.id === id);
            const pages = s.pages.filter((p) => p.id !== id);
            const activePageId =
              s.activePageId === id ? pages[Math.max(0, idx - 1)].id : s.activePageId;
            return { pages, activePageId };
          }),
        movePage: (id, dir) =>
          set((s) => {
            const idx = s.pages.findIndex((p) => p.id === id);
            const to = idx + dir;
            if (idx < 0 || to < 0 || to >= s.pages.length) return s;
            const pages = [...s.pages];
            [pages[idx], pages[to]] = [pages[to], pages[idx]];
            return { pages };
          }),
        setLayout: (pageId, layout) =>
          set((s) => ({
            pages: mapPage(s.pages, pageId, (p) => ({
              ...p,
              layout: layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
            })),
          })),
        addWidget: (pageId, type) => {
          const def = getWidget(type);
          if (!def) return null;
          const id = newId();
          set((s) => ({
            pages: mapPage(s.pages, pageId, (p) => ({
              ...p,
              layout: [
                ...p.layout,
                {
                  i: id,
                  x: 0,
                  y: bottomOf(p.layout),
                  w: Math.min(def.defaultSize.w, GRID_COLS),
                  h: def.defaultSize.h,
                },
              ],
              widgets: { ...p.widgets, [id]: { type, settings: defaultSettings(type) } },
            })),
          }));
          return id;
        },
        removeWidget: (pageId, widgetId) =>
          destructive(
            `Removed ${widgetName(
              get().pages.find((p) => p.id === pageId),
              widgetId,
            )}`,
            (s) => ({
              pages: mapPage(s.pages, pageId, (p) => {
                const widgets = { ...p.widgets };
                delete widgets[widgetId];
                return { ...p, widgets, layout: p.layout.filter((l) => l.i !== widgetId) };
              }),
            }),
          ),
        duplicateWidget: (pageId, widgetId) =>
          set((s) => ({
            pages: mapPage(s.pages, pageId, (p) => {
              const src = p.widgets[widgetId];
              const pos = p.layout.find((l) => l.i === widgetId);
              if (!src || !pos) return p;
              const id = newId();
              return {
                ...p,
                widgets: { ...p.widgets, [id]: structuredClone(src) },
                layout: [...p.layout, { ...pos, i: id, y: bottomOf(p.layout) }],
              };
            }),
          })),
        updateWidgetSettings: (pageId, widgetId, settings) =>
          set((s) => ({
            pages: mapPage(s.pages, pageId, (p) => {
              const w = p.widgets[widgetId];
              if (!w) return p;
              return {
                ...p,
                widgets: {
                  ...p.widgets,
                  [widgetId]: { ...w, settings: normalizeSettings(w.type, settings) },
                },
              };
            }),
          })),
        resetWidgetSettings: (pageId, widgetId) =>
          destructive(
            `Reset ${widgetName(
              get().pages.find((p) => p.id === pageId),
              widgetId,
            )} to its defaults`,
            (s) => ({
              pages: mapPage(s.pages, pageId, (p) => {
                const w = p.widgets[widgetId];
                return w
                  ? {
                      ...p,
                      widgets: {
                        ...p.widgets,
                        [widgetId]: { ...w, settings: defaultSettings(w.type) },
                      },
                    }
                  : p;
              }),
            }),
          ),
        setWidgetData: (pageId, widgetId, data) =>
          set((s) => ({
            pages: mapPage(s.pages, pageId, (p) => {
              const w = p.widgets[widgetId];
              return w ? { ...p, widgets: { ...p.widgets, [widgetId]: { ...w, data } } } : p;
            }),
          })),
        setPageLook: (pageId, look) =>
          set((s) => ({
            pages: mapPage(s.pages, pageId, (p) => {
              const next = { ...p, ...look };
              if (!next.background) delete next.background;
              if (!next.widgetStyle) delete next.widgetStyle;
              return next;
            }),
          })),
        applyWidgetStyle: (pageId, style) =>
          destructive(
            pageId
              ? `Restyled every widget on “${get().pages.find((p) => p.id === pageId)?.name ?? 'this page'}”`
              : 'Restyled every widget on every page',
            (s) => ({
              pages: s.pages.map((p) => {
                if (pageId && p.id !== pageId) return p;
                const widgets = Object.fromEntries(
                  Object.entries(p.widgets).map(([id, w]) => [
                    id,
                    { ...w, settings: { ...w.settings, style: '', paper: 'auto' } },
                  ]),
                );
                const next: Page = { ...p, widgets };
                if (pageId) next.widgetStyle = style;
                else delete next.widgetStyle;
                return next;
              }),
            }),
          ),
        clearPageBackgrounds: () =>
          destructive('Set one background on every page', (s) => ({
            pages: s.pages.map((p) => {
              const next = { ...p };
              delete next.background;
              return next;
            }),
          })),
        nudgeWidget: (pageId, widgetId, nudge) => {
          const page = get().pages.find((p) => p.id === pageId);
          const w = page?.widgets[widgetId];
          if (!page || !w) return null;
          const min = getWidget(w.type)?.minSize ?? { w: 2, h: 2 };
          const layout = nudgeLayout(page.layout, widgetId, nudge, GRID_COLS, min);
          if (layout === page.layout) return null;
          get().setLayout(pageId, layout);
          return layout.find((l) => l.i === widgetId) ?? null;
        },
        replacePages: (pages) => set(sanitize({ pages, activePageId: pages[0]?.id })),
        appendPages: (pages) =>
          set((s) => {
            const added = sanitize({ pages }).pages;
            return { pages: [...s.pages, ...added], activePageId: added[0]?.id ?? s.activePageId };
          }),
      };
    },
    {
      name: 'tarpaulin.dashboard',
      version: DASHBOARD_VERSION,
      partialize: (s) => ({ pages: s.pages, activePageId: s.activePageId }),
      migrate: (persisted, version) =>
        migrateDashboard(persisted, version) as unknown as DashboardState,
      merge: (persisted, current) => ({
        ...current,
        ...sanitize((persisted ?? {}) as Record<string, unknown>),
      }),
    },
  ),
);

// The look picker sets the app look before it touches the pages; snapshot the look from before.
useSettings.subscribe((s, prev) => {
  if (s.background !== prev.background || s.widgetStyle !== prev.widgetStyle)
    snapshot(useDashboard.getState(), {
      background: prev.background,
      widgetStyle: prev.widgetStyle,
    });
});

export function useActivePage(): Page {
  return useDashboard((s) => s.pages.find((p) => p.id === s.activePageId) ?? s.pages[0]);
}
