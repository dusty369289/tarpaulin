import { useId } from 'react';

interface SwitchProps {
  /** Accessible name; shown beside the switch unless `hideLabel`. */
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  /** For rows that already show the label elsewhere. */
  hideLabel?: boolean;
  className?: string;
}

/** The one on/off control in the app: a sliding switch, keyboard and screen-reader friendly. */
export function Switch({
  label,
  checked,
  onChange,
  disabled,
  hideLabel,
  className = '',
}: SwitchProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`inline-flex items-center gap-3 text-sm ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${className}`}
    >
      {!hideLabel && <span>{label}</span>}
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-label={label}
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-5 w-9 rounded-full bg-border transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}
