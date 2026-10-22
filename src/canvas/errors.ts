// What went wrong talking to Canvas, as one stable word the UI can switch on. Every transport
// surfaces errors as text in the end (Tauri commands reject with the Rust error's Display), so
// the kinds are read from the messages that src-tauri/src/canvas.rs and http.ts produce. Those
// messages are pinned by tests on both sides.

import { CanvasHttpError } from './http';
import { isAuthError } from './token';

export type CanvasErrorKind =
  /** The credentials themselves were rejected: reconnect (see token.ts). */
  | 'auth'
  /** Canvas kept throttling us after the retries in http.ts / canvas.rs. */
  | 'rate_limited'
  /** Canvas couldn't be reached at all. */
  | 'offline'
  /** Desktop: the OS keychain holding the login is locked or refused (not a network problem). */
  | 'keychain'
  /** Canvas answered with a 5xx. */
  | 'server'
  /** A valid login that may not see this (permission 401, 403). */
  | 'forbidden'
  | 'not_found'
  | 'other';

const textOf = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : '';

/** The HTTP status behind an error, when Canvas answered at all. */
export function canvasErrorStatus(e: unknown): number | null {
  if (e instanceof CanvasHttpError) return e.status;
  // "Canvas returned 503: …" (both sides), "… rate limit exceeded (403) …", or the dev proxy's
  // "Request failed (502)".
  const m = textOf(e).match(
    /Canvas returned (\d{3})\b|rate limit exceeded \((\d{3})\)|\((\d{3})\)/i,
  );
  const status = m ? Number(m[1] ?? m[2] ?? m[3]) : NaN;
  return Number.isFinite(status) ? status : null;
}

// reqwest ("network error: error sending request…"), browsers ("Failed to fetch", "Load
// failed", "NetworkError when attempting to fetch resource.") and Node ("fetch failed").
const OFFLINE =
  /^network error:|failed to fetch|fetch failed|load failed|networkerror|network request failed|err_internet_disconnected/i;

export function canvasErrorKind(e: unknown): CanvasErrorKind {
  if (isAuthError(e)) return 'auth';
  const text = textOf(e);
  const status = canvasErrorStatus(e);
  if (/rate limit/i.test(text) || status === 429) return 'rate_limited';
  if (OFFLINE.test(text)) return 'offline';
  if (/^keychain error:/i.test(text)) return 'keychain';
  if (status === null) return 'other';
  if (status >= 500) return 'server';
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  return 'other';
}
