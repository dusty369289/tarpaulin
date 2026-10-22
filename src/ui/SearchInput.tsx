import { Search, X } from 'lucide-react';
import type { Ref } from 'react';

/** A search box with a clear button. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  label = placeholder,
  className = '',
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        aria-label={label}
        className="input pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && value && (e.stopPropagation(), onChange(''))}
      />
      {value && (
        <button
          type="button"
          className="btn-icon absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
          aria-label="Clear search"
          onClick={() => onChange('')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
