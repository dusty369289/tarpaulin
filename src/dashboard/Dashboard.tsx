import { LayoutDashboard } from 'lucide-react';
import { useState } from 'react';
import { UpdateBanner } from '../app/UpdateBanner';
import { EditToolbar } from './EditToolbar';
import { Grid } from './Grid';
import { PageStylePanel } from './PageStylePanel';
import { PageTabs } from './PageTabs';
import { useActivePage, useDashboard } from './store';
import { WidgetPicker } from './WidgetPicker';
import { WidgetSettingsPanel } from './WidgetSettingsPanel';

export function Dashboard({ onOpenSettings }: { onOpenSettings: () => void }) {
  const page = useActivePage();
  const editMode = useDashboard((s) => s.editMode);
  const setEditMode = useDashboard((s) => s.setEditMode);
  const addWidget = useDashboard((s) => s.addWidget);
  const [picking, setPicking] = useState(false);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [styling, setStyling] = useState(false);

  return (
    <div className="flex min-h-full flex-col">
      <header className="app-header sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg/85 px-4 py-2 backdrop-blur">
        <div className="flex shrink-0 items-center gap-2 font-semibold">
          <img src="/icon.png" alt="" className="h-6 w-6" />
          <span className="hidden sm:inline">Tarpaulin</span>
        </div>
        <div className="min-w-0 flex-1">
          <PageTabs />
        </div>
        <EditToolbar
          editMode={editMode}
          onToggleEdit={() => setEditMode(!editMode)}
          onAddWidget={() => setPicking(true)}
          onOpenStyle={() => setStyling(true)}
          onOpenSettings={onOpenSettings}
        />
      </header>
      <UpdateBanner />
      <main className="flex-1 p-4">
        {page.layout.length === 0 ? (
          <div className="page-note mx-auto mt-24 flex max-w-sm flex-col items-center gap-3 text-center text-muted animate-fade-in">
            <LayoutDashboard className="h-10 w-10 opacity-50" aria-hidden />
            <p>This page is empty.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditMode(true);
                setPicking(true);
              }}
            >
              Add a widget
            </button>
          </div>
        ) : (
          <Grid page={page} editMode={editMode} onOpenSettings={setSettingsFor} />
        )}
      </main>
      {picking && (
        <WidgetPicker
          onClose={() => setPicking(false)}
          onPick={(type) => {
            const id = addWidget(page.id, type);
            setPicking(false);
            if (id)
              requestAnimationFrame(() =>
                document
                  .querySelector(`[data-widget-id="${id}"]`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
              );
          }}
        />
      )}
      {styling && <PageStylePanel page={page} onClose={() => setStyling(false)} />}
      {settingsFor && page.widgets[settingsFor] && (
        <WidgetSettingsPanel
          page={page}
          widgetId={settingsFor}
          onClose={() => setSettingsFor(null)}
        />
      )}
    </div>
  );
}
