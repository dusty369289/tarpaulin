// Read-only Canvas HTTP helpers shared by the browser transports, the Vite dev proxy and the
// smoke/record scripts. They mirror src-tauri/src/canvas.rs so every path to Canvas enforces the
// same allowlist: GET only, under /api/v1/, on the configured origin.

export type QueryValue = string | number | boolean | null | undefined | Array<string | number>;
export type Query = Record<string, QueryValue>;
export type QueryPairs = Array<[string, string]>;

export const MAX_PAGES = 50;

export function validateApiPath(path: string): boolean {
  if (!path.startsWith('/api/v1/') || path.length > 512) return false;
  if (path.includes('..') || path.includes('//')) return false;
  return /^[A-Za-z0-9/_.-]+$/.test(path);
}

export function assertApiPath(path: string): void {
  if (!validateApiPath(path)) throw new Error(`Not an allowed Canvas API path: ${path}`);
}

/** Canvas wants arrays as repeated `key[]=value` pairs. */
export function toQueryPairs(query: Query = {}): QueryPairs {
  const pairs: QueryPairs = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      const name = key.endsWith('[]') ? key : `${key}[]`;
      for (const v of value) pairs.push([name, String(v)]);
    } else {
      pairs.push([key, String(value)]);
    }
  }
  return pairs;
}

export function encodePairs(pairs: QueryPairs): string {
  return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

export function normalizeBaseUrl(input: string): string {
  const raw = input.trim();
  const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error(`Canvas URL must use https: ${input}`);
  }
  return url.origin;
}

export function parseNextLink(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const match = part.match(/<([^>]+)>\s*;(.*)$/);
    if (match && /rel="?next"?/.test(match[2])) return match[1];
  }
  return null;
}

export function isAllowedNext(baseUrl: string, next: string): boolean {
  try {
    const url = new URL(next);
    return url.origin === new URL(baseUrl).origin && validateApiPath(url.pathname);
  } catch {
    return false;
  }
}

export class CanvasHttpError extends Error {
  constructor(
    public status: number,
    body: string,
  ) {
    super(`Canvas returned ${status}: ${body.slice(0, 300)}`);
  }
}

/** GETs a Canvas API path and, for array responses, follows `Link: rel="next"` through every page. */
export async function fetchAllPages(
  baseUrl: string,
  token: string,
  path: string,
  pairs: QueryPairs,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  assertApiPath(path);
  const origin = normalizeBaseUrl(baseUrl);
  const qs = encodePairs(pairs);
  let url: string | null = `${origin}${path}${qs ? `?${qs}` : ''}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

  let collected: unknown[] | null = null;
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res = await fetchImpl(url, { method: 'GET', headers });
    if (!res.ok) throw new CanvasHttpError(res.status, await res.text());
    const body: unknown = await res.json();
    if (!Array.isArray(body)) return collected ?? body;
    collected = [...(collected ?? []), ...(body as unknown[])];
    const next = parseNextLink(res.headers.get('link'));
    url = next && isAllowedNext(origin, next) ? next : null;
  }
  return collected ?? [];
}
