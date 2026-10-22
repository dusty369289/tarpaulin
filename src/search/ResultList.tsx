import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useCanvas } from '../canvas/CanvasProvider';
import { CourseDot } from '../widgets/shared/ui';
import type { SearchEntry } from './entries';
import { rememberPick, useRecent } from './recent';
import { buildSections, type Section, type SectionOptions } from './results';

// The results half of the combobox pattern, shared by the Quick find palette and the Search
// widget: grouped options in a listbox, an active option the arrows move (focus stays in the
// input, which points at it with aria-activedescendant), Enter to open, Ctrl/⌘+Enter to open in
// Canvas.

export interface ResultListState {
  sections: Section[];
  options: SearchEntry[];
  /** Index of the active option, or -1 when there are none. */
  current: number;
  setActive: (index: number) => void;
  listId: string;
  optionId: (index: number) => string;
  /** Arrow keys, Ctrl/⌘+Home/End and Enter; returns whether it handled the key. */
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => boolean;
  pick: (entry: SearchEntry, inCanvas: boolean) => void;
}

/**
 * Builds the sections for `query` and keeps the active option. `onPick` runs after the pick is
 * remembered; it gets a function that opens the entry (in Canvas when asked and possible).
 */
export function useResultList({
  entries,
  now,
  query,
  options: sectionOptions,
  onPick,
}: {
  entries: SearchEntry[];
  now: Date;
  query: string;
  options?: SectionOptions;
  onPick: (open: () => void, entry: SearchEntry) => void;
}): ResultListState {
  const { openLink } = useCanvas();
  const recent = useRecent();
  const [active, setActive] = useState(0);
  const base = useId();
  const listId = `${base}-list`;
  const { groups, dueWhenEmpty, actionsWhenEmpty } = sectionOptions ?? {};

  const sections = useMemo(
    () => buildSections(entries, query, now, recent, { groups, dueWhenEmpty, actionsWhenEmpty }),
    [entries, query, now, recent, groups, dueWhenEmpty, actionsWhenEmpty],
  );
  const options = useMemo(() => sections.flatMap((s) => s.entries), [sections]);
  const optionId = (i: number) => `${base}-opt-${i}`;
  const current = Math.min(active, options.length - 1);

  // A new query starts at the top.
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (current < 0) return;
    document.getElementById(`${base}-opt-${current}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [current, base]);

  const pick = (entry: SearchEntry, inCanvas: boolean) => {
    rememberPick(entry.id);
    onPick(() => (inCanvas && entry.canvasUrl ? openLink(entry.canvasUrl) : entry.open()), entry);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const n = options.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) setActive((current + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
      return true;
    }
    if ((e.key === 'Home' || e.key === 'End') && (e.ctrlKey || e.metaKey) && n) {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : n - 1);
      return true;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const entry = options[current];
      if (entry) pick(entry, e.ctrlKey || e.metaKey);
      return true;
    }
    return false;
  };

  return { sections, options, current, setActive, listId, optionId, onKeyDown, pick };
}

/** The combobox attributes for the input that drives `list`. */
export function comboboxProps(list: ResultListState, expanded: boolean, label: string) {
  return {
    role: 'combobox' as const,
    'aria-label': label,
    'aria-autocomplete': 'list' as const,
    'aria-expanded': expanded,
    'aria-controls': list.listId,
    'aria-activedescendant':
      expanded && list.current >= 0 ? list.optionId(list.current) : undefined,
    autoComplete: 'off',
    spellCheck: false,
  };
}

/**
 * The grouped listbox. `wide` puts each group's label in a column on the left. The id stays in
 * the document even when empty, so the input's aria-controls always points somewhere.
 */
export function ResultList({
  list,
  className = '',
  wide = false,
  label = 'Results',
  showActive = true,
}: {
  list: ResultListState;
  className?: string;
  wide?: boolean;
  label?: string;
  /** False while the input isn't focused, so a resting widget doesn't look mid-choice. */
  showActive?: boolean;
}) {
  let index = -1;
  return (
    <div
      id={list.listId}
      role="listbox"
      aria-label={label}
      className={`${wide ? 'qf-wide' : ''} ${className}`}
    >
      {list.sections.map((section) => {
        const headingId = `${list.listId}-${section.id}`;
        return (
          <div key={section.id} role="group" aria-labelledby={headingId} className="qf-group">
            <div id={headingId} role="presentation" className="qf-group-label">
              {section.label}
            </div>
            <div className="qf-group-options">
              {section.entries.map((entry) => {
                const i = ++index;
                return (
                  <Option
                    key={entry.id}
                    id={list.optionId(i)}
                    entry={entry}
                    active={showActive && i === list.current}
                    onHover={() => list.setActive(i)}
                    onPick={(inCanvas) => list.pick(entry, inCanvas)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Option({
  id,
  entry,
  active,
  onHover,
  onPick,
}: {
  id: string;
  entry: SearchEntry;
  active: boolean;
  onHover: () => void;
  onPick: (inCanvas: boolean) => void;
}) {
  const Icon = entry.icon;
  return (
    // Options aren't focused (focus stays in the combobox), so keys are handled there; a click
    // picks, with Ctrl/⌘ for Canvas like Ctrl/⌘+Enter.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      id={id}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      data-active={active || undefined}
      className="qf-option"
      onMouseDown={(e) => e.preventDefault()}
      onMouseMove={active ? undefined : onHover}
      onClick={(e) => onPick(e.ctrlKey || e.metaKey)}
    >
      <span className="flex w-2.5 shrink-0 justify-center">
        {entry.color && <CourseDot color={entry.color} />}
      </span>
      {/* What kind of thing it is, read before the title ("Assignment, Problem set 4"). */}
      <Icon className="qf-icon h-4 w-4 shrink-0 text-muted" role="img" aria-label={entry.kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{entry.title}</span>
        {entry.detail && <span className="block truncate text-xs text-muted">{entry.detail}</span>}
      </span>
    </div>
  );
}

/** "3 results", for a polite live region. */
export const resultCount = (n: number) => `${n} ${n === 1 ? 'result' : 'results'}`;
