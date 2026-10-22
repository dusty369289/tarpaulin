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

/** Still throttled after every retry. The text matches CanvasError::RateLimited in canvas.rs. */
export class CanvasRateLimitError extends CanvasHttpError {
  constructor(status: number) {
    super(status, '');
    this.message = `Canvas rate limit exceeded (${status}); try again in a moment`;
  }
}

/** How hard to try again when Canvas throttles us (mirrors `RetryPolicy` in canvas.rs). */
export interface RetryPolicy {
  /** Tries per page, the first included. */
  attempts: number;
  /** Wait before the first retry, doubled for each one after. */
  baseMs: number;
  /** Longest wait, even when Canvas sends a longer Retry-After. */
  maxWaitMs: number;
}

export const RETRY: RetryPolicy = { attempts: 3, baseMs: 1000, maxWaitMs: 10_000 };

/** A 403 from a bucket this close to empty is throttling, whatever the body says. */
const LOW_REMAINING = 10;

/**
 * Canvas throttles with 403 "Rate Limit Exceeded" (and an empty `X-Rate-Limit-Remaining`
 * bucket); proxies in front of it may answer 429. A 403 for anything else is a permission error.
 */
export function isThrottled(status: number, remaining: number | null, body: string): boolean {
  if (status === 429) return true;
  if (status !== 403) return false;
  return /rate limit/i.test(body) || (remaining !== null && remaining <= LOW_REMAINING);
}

/** Retry-After if Canvas sent one, else exponential backoff; jitter (0..1) spreads retries out. */
export function retryDelay(
  policy: RetryPolicy,
  retry: number,
  retryAfterMs: number | null,
  jitter = Math.random(),
): number {
  const backoff = policy.baseMs * 2 ** Math.min(retry - 1, 16) * (0.5 + 0.5 * jitter);
  return Math.min(retryAfterMs ?? backoff, policy.maxWaitMs);
}

const numberHeader = (res: Response, name: string): number | null => {
  const raw = res.headers.get(name);
  const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
};

export interface FetchOptions {
  retry?: RetryPolicy;
  /** Tests pass a fake clock. */
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One GET, tried again while Canvas throttles it. */
async function getPage(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  { retry = RETRY, sleep = wait }: FetchOptions,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetchImpl(url, init);
    if (res.ok) return res;
    const body = await res.text();
    if (!isThrottled(res.status, numberHeader(res, 'x-rate-limit-remaining'), body))
      throw new CanvasHttpError(res.status, body);
    if (attempt >= retry.attempts) throw new CanvasRateLimitError(res.status);
    const after = numberHeader(res, 'retry-after');
    await sleep(retryDelay(retry, attempt, after === null ? null : after * 1000));
  }
}

/** GETs a Canvas API path and, for array responses, follows `Link: rel="next"` through every page. */
export async function fetchAllPages(
  baseUrl: string,
  token: string,
  path: string,
  pairs: QueryPairs,
  fetchImpl: typeof fetch = fetch,
  options: FetchOptions = {},
): Promise<unknown> {
  assertApiPath(path);
  const origin = normalizeBaseUrl(baseUrl);
  const qs = encodePairs(pairs);
  let url: string | null = `${origin}${path}${qs ? `?${qs}` : ''}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

  let collected: unknown[] | null = null;
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res = await getPage(url, { method: 'GET', headers }, fetchImpl, options);
    const body: unknown = await res.json();
    if (!Array.isArray(body)) return collected ?? body;
    collected = [...(collected ?? []), ...(body as unknown[])];
    const next = parseNextLink(res.headers.get('link'));
    url = next && isAllowedNext(origin, next) ? next : null;
  }
  return collected ?? [];
}
