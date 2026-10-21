import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PAGE_ICONS, pageIcon } from './icons';
import { PRESETS } from './presets';
import { useDashboard } from './store';

export function PageTabs() {
  const {
    pages,
    activePageId,
    editMode,
    setActivePage,
    addPage,
    renamePage,
    deletePage,
    movePage,
    setPageIcon,
  } = useDashboard();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const active = pages.find((p) => p.id === activePageId);

  return (
    <div className="flex min-w-0 items-center gap-1">
      <div
        role="tablist"
        aria-label="Pages"
        className="flex min-w-0 items-center gap-1 overflow-x-auto scroll-thin"
      >
        {pages.map((p) => {
          const Icon = pageIcon(p.icon);
          const selected = p.id === activePageId;
          return renaming === p.id ? (
            <input
              key={p.id}
              autoFocus
              defaultValue={p.name}
              aria-label="Page name"
              className="input w-32 py-1"
              onBlur={(e) => {
                renamePage(p.id, e.target.value);
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setRenaming(null);
              }}
            />
          ) : (
            <button
              key={p.id}
              role="tab"
              aria-selected={selected}
              onClick={() => setActivePage(p.id)}
              onDoubleClick={() => editMode && setRenaming(p.id)}
              title={editMode ? 'Double-click to rename' : p.name}
              className={`relative flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ${selected ? 'bg-surface font-semibold shadow-sm ring-1 ring-border' : 'text-muted hover:bg-surface/60 hover:text-text'}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="max-w-[10rem] truncate">{p.name}</span>
            </button>
          );
        })}
      </div>
      <div className="relative shrink-0">
        <button
          type="button"
          className="btn-icon"
          aria-label="Add page"
          title="Add page"
          onClick={() => setMenu((m) => !m)}
        >
          <Plus className="h-4 w-4" />
        </button>
        {menu && (
          <div
            className="absolute left-0 top-9 z-30 w-64 rounded-theme border border-border bg-surface p-1 shadow-xl animate-pop-in"
            onMouseLeave={() => setMenu(false)}
          >
            <button
              type="button"
              className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2"
              onClick={() => {
                addPage();
                setMenu(false);
              }}
            >
              Blank page
            </button>
            <div className="my-1 border-t border-border" />
            {PRESETS.map((preset) => {
              const Icon = pageIcon(preset.icon);
              return (
                <button
                  key={preset.id}
                  type="button"
                  className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                  onClick={() => {
                    addPage(preset.id);
                    setMenu(false);
                  }}
                >
                  <Icon className="mt-0.5 h-4 w-4 text-accent" aria-hidden />
                  <span>
                    <span className="block font-medium">{preset.name}</span>
                    <span className="block text-xs text-muted">{preset.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {editMode && active && (
        <div className="flex shrink-0 items-center gap-0.5 border-l border-border pl-1 animate-fade-in">
          <button
            type="button"
            className="btn-icon"
            aria-label="Move page left"
            onClick={() => movePage(active.id, -1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label="Move page right"
            onClick={() => movePage(active.id, 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <select
            aria-label="Page icon"
            className="input w-auto py-1 text-xs"
            value={active.icon}
            onChange={(e) => setPageIcon(active.id, e.target.value)}
          >
            {Object.keys(PAGE_ICONS).map((k) => (
              <option key={k} value={k}>
                {k.replace(/-/g, ' ')}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-icon hover:text-danger"
            aria-label="Delete page"
            disabled={pages.length <= 1}
            onClick={() => confirm(`Delete “${active.name}”?`) && deletePage(active.id)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
