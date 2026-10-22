import type { ReactNode } from 'react';
import { Radio, RadioGroup } from './RadioGroup';

/** One choice: its value, its name, and an optional icon before the name. */
export type SegmentedOption<T extends string> = readonly [
  value: T,
  label: string,
  icon?: ReactNode,
];

/**
 * A row of labelled choices in one pill, the picked one filled: a `RadioGroup`, so one Tab stop
 * and arrow keys between them. `compact` is the small, quiet version for inside a panel (the
 * picked one on a plain wash instead of the accent).
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  compact,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  compact?: boolean;
}) {
  return (
    <RadioGroup
      label={label}
      value={value}
      options={options.map(([v]) => v)}
      onChange={onChange}
      className={
        compact
          ? 'inline-flex w-fit max-w-full flex-wrap gap-0.5 rounded-md border border-border p-0.5'
          : 'flex flex-wrap gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5'
      }
    >
      {options.map(([v, name, icon]) => {
        const on = v === value;
        return (
          <Radio
            key={v}
            value={v}
            label={name}
            className={
              compact
                ? `inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${on ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'}`
                : `rounded-md px-2.5 py-1 text-sm font-medium transition ${on ? 'bg-accent text-accent-fg shadow-sm' : 'text-muted hover:bg-surface hover:text-text'}`
            }
          >
            {icon}
            {name}
          </Radio>
        );
      })}
    </RadioGroup>
  );
}
