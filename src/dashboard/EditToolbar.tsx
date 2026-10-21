import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { Check, Palette, Pencil, Plus, RefreshCw, Settings } from 'lucide-react';

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
