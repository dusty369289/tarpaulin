import { Fragment, type ReactNode } from 'react';
import { z } from 'zod';
import { Switch } from '../../ui';
import { baseType, numberBounds, readMeta, type FieldMeta } from './fields';

export interface CourseOption {
  id: string;
  name: string;
  color: string;
  /** Tells apart courses with the same name (term or course code). */
  detail?: string;
}

interface SettingsFormProps {
  schema: z.AnyZodObject;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  courses: CourseOption[];
  /** Shown between the Content and Appearance sections (the widget style picker). */
  between?: ReactNode;
}

const humanize = (s: string) =>
  s
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());

/** Builds the settings panel from a zod schema: one control per field, grouped by section. */
export function SettingsForm({ schema, values, onChange, courses, between }: SettingsFormProps) {
  const entries = Object.entries(schema.shape as Record<string, z.ZodTypeAny>).map(([key, s]) => ({
    key,
    schema: s,
    meta: readMeta(s) ?? { label: humanize(key) },
  }));
  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value });
  const sections: Array<[string, typeof entries]> = [
    ['Content', entries.filter((e) => e.meta.section !== 'appearance')],
    ['Appearance', entries.filter((e) => e.meta.section === 'appearance')],
  ];

  return (
    <div className="flex flex-col gap-5">
      {sections.map(([name, fields]) => (
        <Fragment key={name}>
          {name === 'Appearance' && between}
          {fields.length ? (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {name}
              </legend>
              {fields.map((f) => (
                <Field
                  key={f.key}
                  name={f.key}
                  schema={f.schema}
                  meta={f.meta}
                  value={values[f.key]}
                  onChange={(v) => set(f.key, v)}
                  courses={courses}
                />
              ))}
            </fieldset>
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}

interface FieldProps {
  name: string;
  schema: z.ZodTypeAny;
  meta: FieldMeta;
  value: unknown;
  onChange: (v: unknown) => void;
  courses: CourseOption[];
}

function Field({ name, schema, meta, value, onChange, courses }: FieldProps) {
  const base = baseType(schema);
  const id = `setting-${name}`;
  const help = meta.help ? <p className="mt-1 text-xs text-muted">{meta.help}</p> : null;
  if (meta.kind === 'hidden') return null;

  if (base instanceof z.ZodBoolean) {
    return (
      <div>
        <Switch
          label={meta.label}
          checked={Boolean(value)}
          onChange={onChange}
          className="flex w-full justify-between"
        />
        {help}
      </div>
    );
  }

  if (base instanceof z.ZodEnum) {
    const options = base.options as string[];
    return (
      <div>
        <label htmlFor={id} className="label">
          {meta.label}
        </label>
        <select
          id={id}
          className="input"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {meta.options?.[o] ?? humanize(o)}
            </option>
          ))}
        </select>
        {help}
      </div>
    );
  }

  if (base instanceof z.ZodNumber) {
    const { min, max, int } = numberBounds(schema);
    const step = meta.step ?? (int ? 1 : 0.1);
    const slider = min !== undefined && max !== undefined && max - min <= 200;
    const num = typeof value === 'number' ? value : (min ?? 0);
    const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    return (
      <div>
        <label htmlFor={id} className="label flex justify-between">
          <span>{meta.label}</span>
          {slider && (
            <span className="tabular-nums text-text">
              {num}
              {meta.unit ? ` ${meta.unit}` : ''}
            </span>
          )}
        </label>
        {slider ? (
          <input
            id={id}
            type="range"
            min={min}
            max={max}
            step={step}
            value={num}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-[rgb(var(--accent))]"
          />
        ) : (
          <input
            id={id}
            type="number"
            className="input"
            min={min}
            max={max}
            step={step}
            value={num}
            onChange={(e) => e.target.value !== '' && onChange(clamp(Number(e.target.value)))}
          />
        )}
        {help}
      </div>
    );
  }

  if (base instanceof z.ZodString) {
    const str = typeof value === 'string' ? value : '';
    if (meta.kind === 'color') {
      return (
        <div>
          <label htmlFor={id} className="label">
            {meta.label}
          </label>
          <div className="flex items-center gap-2">
            <input
              id={id}
              type="color"
              value={str || '#4f46e5'}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
            />
            <span className="text-xs text-muted">{str || 'Theme default'}</span>
            {str && (
              <button
                type="button"
                className="btn btn-ghost ml-auto px-2 py-0.5 text-xs"
                onClick={() => onChange('')}
              >
                Reset
              </button>
            )}
          </div>
          {help}
        </div>
      );
    }
    if (meta.kind === 'textarea') {
      return (
        <div>
          <label htmlFor={id} className="label">
            {meta.label}
          </label>
          <textarea
            id={id}
            className="input min-h-20"
            value={str}
            onChange={(e) => onChange(e.target.value)}
          />
          {help}
        </div>
      );
    }
    return (
      <div>
        <label htmlFor={id} className="label">
          {meta.label}
        </label>
        <input
          id={id}
          type={meta.kind === 'datetime' ? 'datetime-local' : 'text'}
          className="input"
          value={str}
          onChange={(e) => onChange(e.target.value)}
        />
        {help}
      </div>
    );
  }

  if (base instanceof z.ZodArray && meta.kind === 'courses') {
    const selected = new Set(Array.isArray(value) ? (value as string[]) : []);
    const toggle = (cid: string) => {
      const next = new Set(selected);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      onChange([...next]);
    };
    return (
      <div role="group" aria-labelledby={`${id}-label`}>
        <div id={`${id}-label`} className="label flex justify-between">
          <span>{meta.label}</span>
          {selected.size > 0 && (
            <button
              type="button"
              className="text-accent hover:underline"
              onClick={() => onChange([])}
            >
              All courses
            </button>
          )}
        </div>
        <ul className="flex max-h-48 flex-col gap-0.5 overflow-auto rounded-md border border-border p-1 scroll-thin">
          {courses.length === 0 && (
            <li className="px-1 text-xs text-muted">No courses loaded yet.</li>
          )}
          {courses.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-surface-2">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="accent-[rgb(var(--accent))]"
                />
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color }}
                  aria-hidden
                />
                <span className="min-w-0 truncate">{c.name}</span>
                {c.detail && (
                  <span className="ml-auto shrink-0 truncate pl-1 text-xs text-muted">
                    {c.detail}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
        {help}
      </div>
    );
  }

  return null;
}
