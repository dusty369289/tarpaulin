import { useCallback, useMemo } from 'react';
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { PageSkinContext, usePageLook } from '../theme/look';
import { getWidget } from '../widgets/registry';
import { useDashboard } from './store';
import { GRID_COLS, type Page } from './types';
import { WidgetHost } from './WidgetHost';

const AutoWidthGrid = WidthProvider(GridLayout);

export const ROW_HEIGHT = 36;
export const GRID_MARGIN: [number, number] = [12, 12];

interface GridProps {
  page: Page;
  editMode: boolean;
  onOpenSettings: (widgetId: string) => void;
}

/** react-grid-layout wrapper: static in view mode, draggable and resizable in edit mode. */
export function Grid({ page, editMode, onOpenSettings }: GridProps) {
  const setLayout = useDashboard((s) => s.setLayout);
  const removeWidget = useDashboard((s) => s.removeWidget);
  const duplicateWidget = useDashboard((s) => s.duplicateWidget);
  const setWidgetData = useDashboard((s) => s.setWidgetData);

  const layout = useMemo<Layout[]>(
    () =>
      page.layout.map((l) => {
        const def = getWidget(page.widgets[l.i]?.type ?? '');
        return { ...l, minW: def?.minSize.w ?? 2, minH: def?.minSize.h ?? 2, maxW: GRID_COLS };
      }),
    [page.layout, page.widgets],
  );

  const onLayoutChange = useCallback(
    (next: Layout[]) => {
      const changed =
        next.length !== page.layout.length ||
        next.some((n) => {
          const cur = page.layout.find((l) => l.i === n.i);
          return !cur || cur.x !== n.x || cur.y !== n.y || cur.w !== n.w || cur.h !== n.h;
        });
      if (changed) setLayout(page.id, next);
    },
    [page.id, page.layout, setLayout],
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

  const { widgetStyle } = usePageLook(page);
  return (
    <PageSkinContext.Provider value={widgetStyle}>
      <AutoWidthGrid
        className={
          editMode
            ? 'min-h-[60vh] select-none rounded-theme bg-[radial-gradient(rgb(var(--border))_1px,transparent_1px)] [background-size:16px_16px]'
            : ''
        }
        layout={layout}
        cols={GRID_COLS}
        rowHeight={ROW_HEIGHT}
        margin={GRID_MARGIN}
        containerPadding={[0, 0]}
        isDraggable={editMode}
        isResizable={editMode}
        resizeHandles={['se', 'e', 's']}
        draggableHandle=".widget-drag-handle"
        draggableCancel="button, input, textarea, select, a"
        compactType="vertical"
        onLayoutChange={onLayoutChange}
        useCSSTransforms
      >
        {/* Reading order (top-to-bottom, left-to-right), so tabbing and the lettered panels of the
          Blueprint style follow what's on screen. */}
        {[...page.layout]
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
                    onData={onData}
                  />
                </div>
              </div>
            );
          })}
      </AutoWidthGrid>
    </PageSkinContext.Provider>
  );
}
