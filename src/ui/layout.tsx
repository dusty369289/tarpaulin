import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { foldedIncludesAll } from '../lib/text';
import { Switch } from './Switch';

// The settings layout: rows grouped in cards. A row is its label and help on the left and its
// control on the right, on one line; in a narrow column the control wraps below the label.
//
// Settings search: inside a <SettingsFilter query>, each row shows only if every word of the
// query is in its label, help or keywords (ignoring case and accents), and a section whose rows
// are all filtered out hides itself, so one view can hold every category's matches.

const FilterContext = createContext('');

/** Filters every `Row` inside by `query` (empty shows everything). */
export function SettingsFilter({ query, children }: { query: string; children: ReactNode }) {
  return <FilterContext.Provider value={query.trim()}>{children}</FilterContext.Provider>;
}

/** The settings search query in effect here, trimmed ('' when not searching). */
export const useSettingsFilter = () => useContext(FilterContext);

/** Marks a settings row in the DOM, for sections and search results to count. */
const ROW_ATTR = 'data-settings-row';

/**
 * While searching, whether the element `ref` points at has no matching rows left in it. Read
 * from the DOM after each render, so nothing has to register itself.
 */
export function useNoRows(ref: RefObject<HTMLElement>): boolean {
  const query = useSettingsFilter();
  const [empty, setEmpty] = useState(false);
  // After every render on purpose: rows come and go with their own state. Setting the same
  // value again doesn't re-render, so this settles at once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    setEmpty(Boolean(query) && !ref.current?.querySelector(`[${ROW_ATTR}]`));
  });
  return empty;
}

/**
 * A card of setting rows, with hairline dividers between them. An optional small heading and
 * caption sit above it; `tone="danger"` marks a section of destructive actions.
 */
export function Section({
  title,
  caption,
  tone,
  children,
}: {
  title?: string;
  caption?: string;
  tone?: 'danger';
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const empty = useNoRows(ref);
  const danger = tone === 'danger';
  return (
    <section ref={ref} hidden={empty} className={`${empty ? 'hidden' : 'flex'} flex-col gap-1.5`}>
      {title && (
        <h3
          className={`px-1 text-xs font-semibold uppercase tracking-wide ${danger ? 'text-danger' : 'text-muted'}`}
        >
          {title}
        </h3>
      )}
      {caption && <p className="px-1 text-xs text-muted">{caption}</p>}
      <div
        className={`card flex flex-col divide-y ${danger ? 'divide-danger/25 border-danger/50' : 'divide-border'}`}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * One setting: label and help on the left, the control (`children`) at the right. `stacked`
 * puts a wide control (a picker, a list) under the label instead; `below` is extra content
 * under the row, such as a panel the row opens.
 */
export function Row({
  label,
  children,
  help,
  helpTone,
  keywords,
  stacked,
  below,
  testId,
}: {
  label: string;
  children?: ReactNode;
  help?: string;
  helpTone?: 'danger';
  /** Extra words search should find this row by. */
  keywords?: string;
  stacked?: boolean;
  below?: ReactNode;
  testId?: string;
}) {
  const query = useSettingsFilter();
  if (!foldedIncludesAll(query, label, help, keywords)) return null;
  const text = (
    <div className={stacked ? 'min-w-0' : 'min-w-0 flex-1 basis-56'}>
      <div className="text-sm font-medium">{label}</div>
      {help && (
        <div className={`mt-0.5 text-xs ${helpTone === 'danger' ? 'text-danger' : 'text-muted'}`}>
          {help}
        </div>
      )}
    </div>
  );
  return (
    <div {...{ [ROW_ATTR]: '' }} data-testid={testId} className="flex flex-col gap-3 px-4 py-3">
      {stacked ? (
        <>
          {text}
          {children}
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          {text}
          {children !== undefined && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
          )}
        </div>
      )}
      {below}
    </div>
  );
}

/** What a `SwitchRow` or `SelectRow` passes on to its `Row`. */
interface RowText {
  label: string;
  help?: string;
  /** Extra words search should find this row by. */
  keywords?: string;
  below?: ReactNode;
}

/**
 * A setting that is on or off: a `Row` whose switch is named by the row's label. `children` are
 * extra controls before the switch (quiet hours' times).
 */
export function SwitchRow({
  checked,
  onChange,
  disabled,
  children,
  ...row
}: RowText & {
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <Row {...row}>
      {children}
      <Switch
        hideLabel
        label={row.label}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
    </Row>
  );
}

/** A setting picked from a list: a `Row` whose drop-down is named by the row's label. */
export function SelectRow<T extends string>({
  value,
  options,
  onChange,
  disabled,
  ...row
}: RowText & {
  value: T;
  /** Each choice's value and name, in order. */
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <Row {...row}>
      <select
        className="input w-auto"
        aria-label={row.label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map(([v, name]) => (
          <option key={v} value={v}>
            {name}
          </option>
        ))}
      </select>
    </Row>
  );
}
