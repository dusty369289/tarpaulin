import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import GridLayout, { type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { PageSkinContext, usePageLook } from '../theme/look';
import { getWidget } from '../widgets/registry';
import { compactColumns, COMPACT_COLS, describePlace, type Nudge } from './layout';
import { useDashboard } from './store';
import { GRID_COLS, type Page } from './types';
import { WidgetHost } from './WidgetHost';

export const ROW_HEIGHT = 36;
export const GRID_MARGIN: [number, number] = [12, 12];
/** Grid widths below this (about a 900 px window) stack widgets in COMPACT_COLS columns. */
export const COMPACT_BELOW_PX = 868;

interface GridProps {
  page: Page;
  editMode: boolean;
  onOpenSettings: (widgetId: string) => void;
}

/** Width of the element, kept current with a ResizeObserver (0 until measured). */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * react-grid-layout wrapper: static in view mode, draggable and resizable in edit mode, where
 * each widget's grip also moves (arrows) and resizes (Shift+arrows) it from the keyboard.
 * Narrow windows get a stacked layout worked out from the saved one; it is never saved, so
 * widgets can't be rearranged until the window is wider again.
 */
export function Grid({ page, editMode, onOpenSettings }: GridProps) {
  const setLayout = useDashboard((s) => s.setLayout);
  const removeWidget = useDashboard((s) => s.removeWidget);
  const duplicateWidget = useDashboard((s) => s.duplicateWidget);
  const setWidgetData = useDashboard((s) => s.setWidgetData);
  const nudgeWidget = useDashboard((s) => s.nudgeWidget);
  const [ref, width] = useWidth();
  const compact = width > 0 && width < COMPACT_BELOW_PX;
  const cols = compact ? COMPACT_COLS : GRID_COLS;
  const [announcement, setAnnouncement] = useState('');

  const placed = useMemo(
    () => (compact ? compactColumns(page.layout, GRID_COLS) : page.layout),
    [compact, page.layout],
  );
  const layout = useMemo<Layout[]>(
    () =>
      placed.map((l) => {
        const def = getWidget(page.widgets[l.i]?.type ?? '');
        const minW = Math.min(def?.minSize.w ?? 2, cols);
        return { ...l, minW, minH: def?.minSize.h ?? 2, maxW: cols };
      }),
    [placed, page.widgets, cols],
  );

  const onLayoutChange = useCallback(
    (next: Layout[]) => {
      if (compact) return;
      const changed =
        next.length !== page.layout.length ||
        next.some((n) => {
          const cur = page.layout.find((l) => l.i === n.i);
          return !cur || cur.x !== n.x || cur.y !== n.y || cur.w !== n.w || cur.h !== n.h;
        });
      if (changed) setLayout(page.id, next);
    },
    [compact, page.id, page.layout, setLayout],
  );

  const onRemove = useCallback((id: string) => removeWidget(page.id, id), [page.id, removeWidget]);
  const onDuplicate = useCallback(
    (id: string) => duplicateWidget(page.id, id),
    [page.id, duplicateWidget],
  );
  const onData = useCallback(
    (id: string, data: unknown) => setWidgetData(page.id, id, data),
    [page.id, setWidgetData],
  );
  const onNudge = useCallback(
    (id: string, nudge: Nudge) => {
      const name = document.querySelector(`[data-widget-id="${id}"] h2`)?.textContent ?? 'Widget';
      const moved = nudgeWidget(page.id, id, nudge);
      const resizing = Boolean(nudge.dw || nudge.dh);
      // Repeat the place even when it didn't change, so every key press says something.
      const place = moved ?? page.layout.find((l) => l.i === id);
      setAnnouncement(
        `${name} ${moved ? (resizing ? 'resized' : 'moved') : resizing ? "can't resize further" : "can't move further"}: ${place ? describePlace(place) : ''}`,
      );
      // Reading order may have changed, and React moving the focused grip in the DOM drops focus.
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-widget-id="${id}"] .widget-move`)?.focus(),
      );
    },
    [page.id, page.layout, nudgeWidget],
  );

  const { widgetStyle } = usePageLook(page);
  return (
    <PageSkinContext.Provider value={widgetStyle}>
      {editMode && compact && (
        <p className="page-note mb-3 w-fit text-sm text-muted" data-testid="compact-note">
          The window is narrow, so widgets are stacked. Widen it to move or resize them.
        </p>
      )}
      <div ref={ref} data-grid-cols={cols}>
        {width > 0 && (
          <GridLayout
            width={width}
            className={
              editMode
                ? 'min-h-[60vh] select-none rounded-theme bg-[radial-gradient(rgb(var(--border))_1px,transparent_1px)] [background-size:16px_16px]'
                : ''
            }
            layout={layout}
            cols={cols}
            rowHeight={ROW_HEIGHT}
            margin={GRID_MARGIN}
            containerPadding={[0, 0]}
            isDraggable={editMode && !compact}
            isResizable={editMode && !compact}
            resizeHandles={['se', 'e', 's']}
            draggableHandle=".widget-drag-handle"
            draggableCancel="button:not(.widget-move), input, textarea, select, a"
            compactType="vertical"
            onLayoutChange={onLayoutChange}
            useCSSTransforms
          >
            {/* Reading order (top-to-bottom, left-to-right), so tabbing and the lettered panels of
              the Blueprint style follow what's on screen. */}
            {[...placed]
              .sort((a, b) => a.y - b.y || a.x - b.x)
              .map((l) => {
                const instance = page.widgets[l.i];
                if (!instance) return null;
                return (
                  // The entry animation lives on an inner wrapper: on the grid item itself its final
                  // `transform` would override react-grid-layout's inline translate and stack every widget at 0,0.
                  <div key={l.i} data-widget-id={l.i} data-widget-type={instance.type}>
                    <div className="h-full animate-pop-in">
                      <WidgetHost
                        id={l.i}
                        instance={instance}
                        size={{ w: l.w, h: l.h }}
                        editMode={editMode}
                        onSettings={editMode ? onOpenSettings : undefined}
                        onRemove={editMode ? onRemove : undefined}
                        onDuplicate={editMode ? onDuplicate : undefined}
                        onNudge={editMode && !compact ? onNudge : undefined}
                        onData={onData}
                      />
                    </div>
                  </div>
                );
              })}
          </GridLayout>
        )}
      </div>
      <div aria-live="polite" className="sr-only" data-testid="grid-announcer">
        {announcement}
      </div>
    </PageSkinContext.Provider>
  );
}
