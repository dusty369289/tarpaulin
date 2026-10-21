import { z } from 'zod';

// Settings forms are generated from each widget's zod schema. Labels and the few input kinds that
// a zod type alone can't express (colour, course picker, multi-line text) ride along in
// `.describe()` as JSON.

export type FieldKind = 'color' | 'courses' | 'textarea' | 'datetime' | 'hidden';

export interface FieldMeta {
  label: string;
  help?: string;
  kind?: FieldKind;
  section?: 'appearance' | 'content';
  /** Display names for enum values. */
  options?: Record<string, string>;
  step?: number;
  unit?: string;
}

export function field<T extends z.ZodTypeAny>(schema: T, meta: FieldMeta): T {
  return schema.describe(JSON.stringify(meta)) as T;
}

export function readMeta(schema: z.ZodTypeAny): FieldMeta | null {
  let current: z.ZodTypeAny | undefined = schema;
  while (current) {
    if (current.description) {
      try {
        return JSON.parse(current.description) as FieldMeta;
      } catch {
        return { label: current.description };
      }
    }
    current = innerType(current);
  }
  return null;
}

/** Strips ZodDefault / ZodOptional / ZodNullable / ZodEffects to the underlying type. */
export function innerType(schema: z.ZodTypeAny): z.ZodTypeAny | undefined {
  if (schema instanceof z.ZodDefault) return schema._def.innerType;
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return schema.unwrap();
  if (schema instanceof z.ZodEffects) return schema.innerType();
  return undefined;
}

export function baseType(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  for (let next = innerType(current); next; next = innerType(current)) current = next;
  return current;
}

export function numberBounds(schema: z.ZodTypeAny): { min?: number; max?: number; int: boolean } {
  const base = baseType(schema);
  const out: { min?: number; max?: number; int: boolean } = { int: false };
  if (base instanceof z.ZodNumber) {
    for (const check of base._def.checks) {
      if (check.kind === 'min') out.min = check.value;
      if (check.kind === 'max') out.max = check.value;
      if (check.kind === 'int') out.int = true;
    }
  }
  return out;
}

/**
 * Parses stored settings, keeping every valid field and falling back to the default for any field
 * that is missing or invalid, so one bad value never resets the whole widget.
 */
export function parseWithDefaults<S extends z.AnyZodObject>(schema: S, raw: unknown): z.infer<S> {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const whole = schema.safeParse(input);
  if (whole.success) return whole.data;
  const out: Record<string, unknown> = {};
  for (const [key, fieldSchema] of Object.entries(schema.shape as Record<string, z.ZodTypeAny>)) {
    const parsed = fieldSchema.safeParse(input[key]);
    out[key] = parsed.success ? parsed.data : fieldSchema.safeParse(undefined).data;
  }
  return schema.parse(out);
}

/** The widget-level course filter every data widget offers. */
export const courseFilter = () =>
  field(z.array(z.string()).default([]), {
    label: 'Courses',
    kind: 'courses',
    help: 'Leave empty to include every course in scope.',
  });
