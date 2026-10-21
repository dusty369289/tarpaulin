import { createContext, useContext, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface Group {
  value: string;
  onChange: (value: string) => void;
  /** The radio that takes the Tab stop when none is checked. */
  fallback: string | undefined;
}

const GroupContext = createContext<Group | null>(null);

const NEXT: Record<string, 1 | -1> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * A set of choices with one picked, as the radio group pattern expects: the whole group is one
 * Tab stop (the picked option), arrow keys move to the next or previous option and pick it,
 * Home and End jump to the ends. Options are `<Radio>`s anywhere inside, in any layout.
 */
export function RadioGroup({
  label,
  value,
  onChange,
  options,
  className,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Every option's value, in order, so the group knows whether `value` is one of them. */
  options: string[];
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fallback = options.includes(value) ? undefined : options[0];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const radios = [
      ...(ref.current?.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])') ?? []),
    ];
    const at = radios.indexOf(e.target as HTMLElement);
    if (at < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    const to =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? radios.length - 1
          : e.key in NEXT
            ? (at + NEXT[e.key] + radios.length) % radios.length
            : -1;
    if (to < 0) return;
    e.preventDefault();
    radios[to].focus();
    const next = radios[to].dataset.value;
    if (next !== undefined && next !== value) onChange(next);
  };

  return (
    <GroupContext.Provider value={{ value, onChange, fallback }}>
      <div
        ref={ref}
        role="radiogroup"
        aria-label={label}
        className={className}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </GroupContext.Provider>
  );
}

/** One option of a `RadioGroup`. Renders a button; style it like any other. */
export function Radio({
  value,
  label,
  title,
  className,
  testId,
  children,
}: {
  value: string;
  /** Accessible name. */
  label: string;
  title?: string;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  const group = useContext(GroupContext);
  if (!group) throw new Error('<Radio> must be inside a <RadioGroup>');
  const checked = group.value === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      title={title}
      data-value={value}
      data-testid={testId}
      tabIndex={checked || group.fallback === value ? 0 : -1}
      onClick={() => group.onChange(value)}
      className={className}
    >
      {children}
    </button>
  );
}
