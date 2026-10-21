import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { SearchInput } from './SearchInput';

interface FoldedListProps<T> {
  items: T[];
  /** Stable key per item. */
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Text an item is searched by; enables the search box. */
  searchText?: (item: T) => string;
  /** Rows shown while folded. */
  folded?: number;
  /** Plural noun for the buttons and empty message, e.g. "courses". */
  noun: string;
  className?: string;
}

/**
 * A long list shown folded: the first few rows, a button to show the rest, and an optional
 * search that filters across everything (searching always shows every match).
 */
export function FoldedList<T>({
  items,
  itemKey,
  renderItem,
  searchText,
  folded = 5,
  noun,
  className = '',
}: FoldedListProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches =
    q && searchText ? items.filter((i) => searchText(i).toLowerCase().includes(q)) : items;
  const shown = q || open ? matches : matches.slice(0, folded);
  const hidden = matches.length - shown.length;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {searchText && items.length > folded && (
        <SearchInput value={query} onChange={setQuery} placeholder={`Search ${noun}`} />
      )}
      {shown.length === 0 ? (
        <p className="py-2 text-sm text-muted">
          No {noun} match “{query.trim()}”.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border" aria-label={noun}>
          {shown.map((item) => (
            <li key={itemKey(item)} className="animate-fade-in">
              {renderItem(item)}
            </li>
          ))}
        </ul>
      )}
      {!q && items.length > folded && (
        <button
          type="button"
          className="btn btn-ghost self-start text-xs"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {open ? `Show fewer ${noun}` : `Show all ${items.length} ${noun} (${hidden} more)`}
        </button>
      )}
    </div>
  );
}
