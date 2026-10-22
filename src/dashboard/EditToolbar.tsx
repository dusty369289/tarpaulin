import { useIsFetching, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Check, CloudOff, Palette, Pencil, Plus, RefreshCw, Settings } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { canvasErrorKind } from '../canvas/errors';
import { updatedAgo } from '../lib/dates';

interface EditToolbarProps {
  editMode: boolean;
  onToggleEdit: () => void;
  onAddWidget: () => void;
  onOpenStyle: () => void;
  onOpenSettings: () => void;
}

/**
 * The bar's right-hand buttons, in groups: page editing (edit mode only), Edit/Done, then app
 * actions. Labels drop to icons on narrow windows; every button keeps its accessible name.
 */
export function EditToolbar({
  editMode,
  onToggleEdit,
  onAddWidget,
  onOpenStyle,
  onOpenSettings,
}: EditToolbarProps) {
  const queryClient = useQueryClient();
  const fetching = useIsFetching({ queryKey: ['canvas'] });
  return (
    <div className="flex shrink-0 items-center gap-1">
      {editMode && (
        <div className="bar-group animate-pop-in" role="group" aria-label="Page editing">
          <button
            type="button"
            className="bar-btn"
            aria-label="Add widget"
            title="Add widget"
            onClick={onAddWidget}
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span className="bar-btn-label">Add widget</span>
          </button>
          <button
            type="button"
            className="bar-btn"
            aria-label="Style"
            title="Style this page"
            onClick={onOpenStyle}
          >
            <Palette className="h-4 w-4" aria-hidden />
            <span className="bar-btn-label">Style</span>
          </button>
        </div>
      )}
      <button
        type="button"
        className={`bar-btn ${editMode ? 'bar-btn-primary' : ''}`}
        onClick={onToggleEdit}
        aria-pressed={editMode}
        title={editMode ? 'Finish editing' : 'Edit this page'}
      >
        {editMode ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : (
          <Pencil className="h-4 w-4" aria-hidden />
        )}
        {editMode ? 'Done' : 'Edit'}
      </button>
      <span className="bar-divider" aria-hidden />
      <CanvasStatus />
      <button
        type="button"
        className="bar-icon"
        aria-label="Refresh from Canvas"
        title="Refresh from Canvas"
        onClick={() => queryClient.invalidateQueries({ queryKey: ['canvas'] })}
      >
        <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} aria-hidden />
      </button>
      <button
        type="button"
        className="bar-icon"
        aria-label="Settings"
        title="Settings"
        onClick={onOpenSettings}
      >
        <Settings className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * How the cached Canvas data stands, as "offline|failing|updatedAt" so the bar re-renders only
 * when that changes. `failing` means a refresh failed while older data is still on screen (a
 * widget with nothing to show has its own error). `updatedAt` is when that data is from.
 */
function canvasHealth(queryClient: QueryClient): string {
  let offline = navigator.onLine === false;
  let failing = false;
  let oldestStale = Infinity;
  let newest = 0;
  for (const q of queryClient.getQueryCache().findAll({ queryKey: ['canvas'] })) {
    const { status, dataUpdatedAt, error } = q.state;
    newest = Math.max(newest, dataUpdatedAt);
    if (status !== 'error') continue;
    if (canvasErrorKind(error) === 'offline') offline = true;
    if (dataUpdatedAt) {
      failing = true;
      oldestStale = Math.min(oldestStale, dataUpdatedAt);
    }
  }
  const at = Number.isFinite(oldestStale) ? oldestStale : newest;
  return `${offline}|${failing}|${at}`;
}

function useCanvasHealth() {
  const queryClient = useQueryClient();
  const snapshot = useSyncExternalStore(
    (onChange) => {
      const stop = queryClient.getQueryCache().subscribe(onChange);
      window.addEventListener('online', onChange);
      window.addEventListener('offline', onChange);
      return () => {
        stop();
        window.removeEventListener('online', onChange);
        window.removeEventListener('offline', onChange);
      };
    },
    () => canvasHealth(queryClient),
  );
  const [offline, failing, at] = snapshot.split('|');
  return { offline: offline === 'true', failing: failing === 'true', updatedAt: Number(at) };
}

/** "Offline · updated 2 h ago" next to Refresh, shown only while the data on screen is behind. */
function CanvasStatus() {
  const { offline, failing, updatedAt } = useCanvasHealth();
  const shown = offline || failing;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!shown) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [shown]);
  if (!shown) return null;
  const when = updatedAt ? `updated ${updatedAgo(updatedAt, now)}` : null;
  const why = offline
    ? 'Tarpaulin can’t reach Canvas, so this is the last data it saved'
    : 'Canvas didn’t answer the last refresh, so some of this is older data';
  return (
    <span
      role="status"
      data-testid="canvas-status"
      className="chip mr-1 shrink-0 bg-warning/15 text-warning"
      title={`${why}${when ? ` (${when})` : ''}.`}
    >
      <CloudOff className="h-3.5 w-3.5" aria-hidden />
      {offline ? 'Offline' : 'Couldn’t refresh'}
      {when && <span className="bar-btn-label">· {when}</span>}
    </span>
  );
}
