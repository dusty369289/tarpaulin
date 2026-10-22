import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Ellipsis,
  PencilLine,
  Plus,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PAGE_ICONS, pageIcon } from './icons';
import { PRESETS } from './presets';
import { useDashboard } from './store';
import { useDismiss } from './useDismiss';

type Menu = 'add' | 'all' | 'options' | null;

/**
 * The page tabs in the top bar. Tabs scroll sideways when there are many (edges fade, the
 * active tab is kept in view, and an "All pages" menu lists every page); arrow keys move
 * between tabs. In edit mode the active page gets a "Page options" menu (rename, icon, order,
 * delete). `onMenuChange` tells the bar a menu is open, so a folding bar stays out.
 */
export function PageTabs({ onMenuChange }: { onMenuChange?: (open: boolean) => void }) {
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
  const [menu, setMenu] = useState<Menu>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const active = pages.find((p) => p.id === activePageId);
  const list = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    onMenuChange?.(menu !== null || renaming !== null);
  }, [menu, renaming, onMenuChange]);
  useEffect(() => {
    if (!editMode) setMenu((m) => (m === 'options' ? null : m));
  }, [editMode]);

  // Which edges have hidden tabs beyond them (drives the fades and the "All pages" menu).
  const measure = useCallback(() => {
    const el = list.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);
  // Keep the active tab in view, without scrolling the page itself.
  const showActive = useCallback(
    (behavior: ScrollBehavior) => {
      const el = list.current;
      const tab = el?.querySelector<HTMLElement>(`[data-page-id="${activePageId}"]`);
      if (!el || !tab) return;
      const pad = 40;
      if (tab.offsetLeft - pad < el.scrollLeft)
        el.scrollTo({ left: tab.offsetLeft - pad, behavior });
      else if (tab.offsetLeft + tab.offsetWidth + pad > el.scrollLeft + el.clientWidth)
        el.scrollTo({ left: tab.offsetLeft + tab.offsetWidth + pad - el.clientWidth, behavior });
    },
    [activePageId],
  );
  useEffect(() => showActive('smooth'), [showActive, pages.length]);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(() => {
      showActive('auto');
      measure();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, showActive, pages, editMode, renaming]);

  const onTabKey = (e: React.KeyboardEvent, index: number) => {
    const to =
      e.key === 'ArrowRight'
        ? (index + 1) % pages.length
        : e.key === 'ArrowLeft'
          ? (index - 1 + pages.length) % pages.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? pages.length - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    setActivePage(pages[to].id);
    list.current?.querySelector<HTMLElement>(`[data-page-id="${pages[to].id}"]`)?.focus();
  };

  const overflowing = edges.left || edges.right;
  return (
    <div className="bar-pages">
      <div
        ref={list}
        role="tablist"
        aria-label="Pages"
        className="bar-tabs"
        data-fade-left={edges.left || undefined}
        data-fade-right={edges.right || undefined}
        onScroll={measure}
      >
        {pages.map((p, i) => {
          const Icon = pageIcon(p.icon);
          const selected = p.id === activePageId;
          return renaming === p.id ? (
            <input
              key={p.id}
              data-page-id={p.id}
              autoFocus
              defaultValue={p.name}
              aria-label="Page name"
              className="input bar-rename"
              onFocus={(e) => e.currentTarget.select()}
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
              type="button"
              role="tab"
              data-page-id={p.id}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActivePage(p.id)}
              onKeyDown={(e) => onTabKey(e, i)}
              onDoubleClick={() => editMode && setRenaming(p.id)}
              title={editMode ? 'Double-click to rename' : p.name}
              className="bar-tab"
            >
              <Icon className="bar-tab-icon h-4 w-4 shrink-0" aria-hidden />
              <span className="max-w-[10rem] truncate">{p.name}</span>
            </button>
          );
        })}
      </div>

      {overflowing && (
        <Popover
          open={menu === 'all'}
          onToggle={() => setMenu((m) => (m === 'all' ? null : 'all'))}
          onClose={close}
          label="All pages"
          icon={<ChevronDown className="h-4 w-4" />}
          align="right"
        >
          <div className="flex flex-col">
            {pages.map((p) => {
              const Icon = pageIcon(p.icon);
              const selected = p.id === activePageId;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-current={selected ? 'page' : undefined}
                  className="bar-menu-item"
                  onClick={() => {
                    setActivePage(p.id);
                    close();
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {selected && <Check className="h-4 w-4 text-accent" aria-hidden />}
                </button>
              );
            })}
          </div>
        </Popover>
      )}

      <Popover
        open={menu === 'add'}
        onToggle={() => setMenu((m) => (m === 'add' ? null : 'add'))}
        onClose={close}
        label="Add page"
        icon={<Plus className="h-4 w-4" />}
        wide
      >
        <button
          type="button"
          className="bar-menu-item"
          onClick={() => {
            addPage();
            close();
          }}
        >
          <Plus className="h-4 w-4 text-muted" aria-hidden />
          Blank page
        </button>
        <div className="my-1 border-t border-border" />
        {PRESETS.map((preset) => {
          const Icon = pageIcon(preset.icon);
          return (
            <button
              key={preset.id}
              type="button"
              className="bar-menu-item items-start"
              onClick={() => {
                addPage(preset.id);
                close();
              }}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span>
                <span className="block font-medium">{preset.name}</span>
                <span className="block text-xs text-muted">{preset.description}</span>
              </span>
            </button>
          );
        })}
      </Popover>

      {editMode && active && (
        <Popover
          open={menu === 'options'}
          onToggle={() => setMenu((m) => (m === 'options' ? null : 'options'))}
          onClose={close}
          label="Page options"
          icon={<Ellipsis className="h-4 w-4" />}
          className="animate-pop-in"
        >
          <div className="px-2 pb-1 pt-1.5 text-xs font-semibold text-muted">{active.name}</div>
          <button
            type="button"
            className="bar-menu-item"
            onClick={() => {
              close();
              setRenaming(active.id);
            }}
          >
            <PencilLine className="h-4 w-4 text-muted" aria-hidden /> Rename page
          </button>
          <div className="flex gap-1 px-1 py-0.5">
            <button
              type="button"
              className="bar-menu-item flex-1"
              aria-label="Move page left"
              disabled={pages[0]?.id === active.id}
              onClick={() => movePage(active.id, -1)}
            >
              <ArrowLeft className="h-4 w-4 text-muted" aria-hidden /> Left
            </button>
            <button
              type="button"
              className="bar-menu-item flex-1"
              aria-label="Move page right"
              disabled={pages[pages.length - 1]?.id === active.id}
              onClick={() => movePage(active.id, 1)}
            >
              <ArrowRight className="h-4 w-4 text-muted" aria-hidden /> Right
            </button>
          </div>
          <div className="my-1 border-t border-border" />
          <div className="px-2 pb-1 text-xs text-muted" id="page-icon-label">
            Icon
          </div>
          <div
            role="radiogroup"
            aria-labelledby="page-icon-label"
            className="grid grid-cols-6 gap-1 px-1 pb-1"
          >
            {Object.entries(PAGE_ICONS).map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active.icon === key}
                aria-label={key.replace(/-/g, ' ')}
                title={key.replace(/-/g, ' ')}
                className={`flex h-8 items-center justify-center rounded-md transition ${active.icon === key ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-text'}`}
                onClick={() => setPageIcon(active.id, key)}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </button>
            ))}
          </div>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            className="bar-menu-item text-danger hover:!bg-danger/10"
            disabled={pages.length <= 1}
            // No confirmation: the undo toast brings the page back.
            onClick={() => {
              close();
              deletePage(active.id);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Delete page
          </button>
        </Popover>
      )}
    </div>
  );
}

/** An icon button in the bar with a menu under it. */
function Popover({
  open,
  onToggle,
  onClose,
  label,
  icon,
  children,
  wide,
  align = 'left',
  className = '',
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
  align?: 'left' | 'right';
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useDismiss(open, panel, onClose, trigger);
  return (
    <div className={`relative shrink-0 ${className}`}>
      <button
        ref={trigger}
        type="button"
        className="bar-icon"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={onToggle}
      >
        {icon}
      </button>
      {open && (
        <div
          ref={panel}
          className={`bar-menu animate-pop-in ${wide ? 'w-72' : 'w-60'} ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
