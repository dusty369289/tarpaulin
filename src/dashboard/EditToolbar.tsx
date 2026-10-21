import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { Check, Palette, Pencil, Plus, RefreshCw, Settings } from 'lucide-react';

interface EditToolbarProps {
  editMode: boolean;
  onToggleEdit: () => void;
  onAddWidget: () => void;
  onOpenStyle: () => void;
  onOpenSettings: () => void;
}

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
        <button type="button" className="btn animate-pop-in" onClick={onAddWidget}>
          <Plus className="h-4 w-4" /> Add widget
        </button>
      )}
      {editMode && (
        <button type="button" className="btn animate-pop-in" onClick={onOpenStyle}>
          <Palette className="h-4 w-4" /> Style
        </button>
      )}
      <button
        type="button"
        className={`btn ${editMode ? 'btn-primary' : ''}`}
        onClick={onToggleEdit}
        aria-pressed={editMode}
      >
        {editMode ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        {editMode ? 'Done' : 'Edit'}
      </button>
      <button
        type="button"
        className="btn-icon"
        aria-label="Refresh from Canvas"
        title="Refresh from Canvas"
        onClick={() => queryClient.invalidateQueries({ queryKey: ['canvas'] })}
      >
        <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
      </button>
      <button
        type="button"
        className="btn-icon"
        aria-label="Settings"
        title="Settings"
        onClick={onOpenSettings}
      >
        <Settings className="h-4 w-4" />
      </button>
    </div>
  );
}
