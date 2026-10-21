import type { z } from 'zod';
import type { Query } from './http';

/** GET a Canvas API path (all pages joined). Every transport provides one of these. */
export type Fetcher = (path: string, query?: Query) => Promise<unknown>;

export interface Urls {
  baseUrl: string;
  /** Planner and todo URLs are often relative ("/courses/1/assignments/2"). */
  absolute: (url: string | null | undefined) => string | null;
}

/**
 * One Canvas endpoint, fully described: its cache key, how to fetch it and how to turn the raw
 * response into plain, JSON-serialisable app data. Parameterised endpoints are functions that
 * return a Resource, e.g. `Assignments(courseId)`.
 */
export interface Resource<T> {
  key: readonly unknown[];
  /** False when the parameters make the request pointless (e.g. no courses selected). */
  enabled: boolean;
  load: (get: Fetcher, urls: Urls) => Promise<T>;
}

/** Parses each element on its own so one odd record doesn't hide the rest. */
export function parseList<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
  label: string,
): z.output<S>[] {
  if (!Array.isArray(data)) {
    console.warn(`[canvas] expected an array for ${label}`, data);
    return [];
  }
  const out: z.output<S>[] = [];
  for (const item of data) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
    else {
      const issue = parsed.error.issues[0];
      console.warn(`[canvas] skipped malformed ${label}: ${issue.path.join('.')} ${issue.message}`);
    }
  }
  return out;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface ListOptions<S extends z.ZodTypeAny, T> {
  key: readonly unknown[];
  path: string;
  query?: Query;
  schema: S;
  label: string;
  /** Return null to drop a record. */
  map: (raw: z.output<S>, urls: Urls) => T | null;
  /**
   * Splits one array parameter across several requests (Canvas caps context_codes at 10 and
   * silently ignores the rest), then concatenates the results.
   */
  batch?: { param: string; values: string[]; size: number };
  sort?: (a: T, b: T) => number;
  enabled?: boolean;
}

export function listResource<S extends z.ZodTypeAny, T>(o: ListOptions<S, T>): Resource<T[]> {
  return {
    key: o.key,
    enabled: o.enabled ?? true,
    async load(get, urls) {
      const queries = o.batch
        ? chunk(o.batch.values, o.batch.size).map((values) => ({
            ...o.query,
            [o.batch!.param]: values,
          }))
        : [o.query];
      const pages = await Promise.all(queries.map((q) => get(o.path, q)));
      const out = pages
        .flatMap((data) => parseList(o.schema, data, o.label))
        .map((raw) => o.map(raw, urls))
        .filter((x): x is T => x !== null);
      return o.sort ? out.sort(o.sort) : out;
    },
  };
}

interface ObjectOptions<S extends z.ZodTypeAny, T> {
  key: readonly unknown[];
  path: string;
  query?: Query;
  schema: S;
  map: (raw: z.output<S>, urls: Urls) => T;
}

export function objectResource<S extends z.ZodTypeAny, T>(o: ObjectOptions<S, T>): Resource<T> {
  return {
    key: o.key,
    enabled: true,
    async load(get, urls) {
      return o.map(o.schema.parse(await get(o.path, o.query)), urls);
    },
  };
}
