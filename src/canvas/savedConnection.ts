// The last connection check that worked, kept so a cold start that can't reach Canvas (offline,
// a 5xx, rate limited) still opens the cached dashboard. Only `ConnectionInfo` is kept: the base
// URL, the sign-in method and the user's name. Never the token.
//
// The saved copy is read back as untrusted input: anything that isn't exactly the shape below is
// ignored (and removed), so a hand-edited or stale entry can't put the app in a strange state.

import { z } from 'zod';
import { canvasErrorKind, type CanvasErrorKind } from './errors';
import type { Transport } from './transport';
import type { ConnectionInfo } from './types';

/** One slot per transport, so the desktop app, the dev proxy and fixtures never share one. */
export const savedConnectionKey = (kind: Transport['kind']) => `tarpaulin.connection.${kind}`;

/** As long as the saved Canvas data (main.tsx): past that there's nothing left to show. */
export const SAVED_CONNECTION_MAX_AGE = 14 * 24 * 60 * 60_000;

/**
 * The failures the saved copy may stand in for. `auth` (the token was rejected) and `keychain`
 * (the token couldn't be read) never are: cached data must not hide either.
 */
const FALLBACK_KINDS: ReadonlySet<CanvasErrorKind> = new Set([
  'offline',
  'server',
  'rate_limited',
  'other',
]);

export const canUseSavedConnection = (error: unknown): boolean =>
  FALLBACK_KINDS.has(canvasErrorKind(error));

const httpUrl = z
  .string()
  .max(2048)
  .refine((s) => {
    try {
      const u = new URL(s);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  });

const SavedConnection = z.object({
  v: z.literal(1),
  savedAt: z.number().finite(),
  info: z.object({
    connected: z.literal(true),
    baseUrl: httpUrl,
    method: z.enum(['token', 'oauth', 'dev-proxy', 'fixtures']),
    userName: z.string().max(500).nullable(),
  }),
});

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Remembers a check that worked, and returns what was kept. A disconnected answer forgets
 * instead (and returns null).
 */
export function saveConnection(
  kind: Transport['kind'],
  info: ConnectionInfo,
  now = Date.now(),
): ConnectionInfo | null {
  if (!info.connected) {
    clearSavedConnection(kind);
    return null;
  }
  const record = SavedConnection.safeParse({
    v: 1,
    savedAt: now,
    info: {
      connected: true,
      baseUrl: info.baseUrl,
      method: info.method,
      userName: info.userName,
    },
  });
  // Something odd came back from the check: don't keep it, and don't keep an older copy either.
  if (!record.success) {
    clearSavedConnection(kind);
    return null;
  }
  try {
    storage()?.setItem(savedConnectionKey(kind), JSON.stringify(record.data));
  } catch {
    /* storage full or blocked: only this run can fall back on it */
  }
  return { ...record.data.info };
}

export function clearSavedConnection(kind: Transport['kind']) {
  try {
    storage()?.removeItem(savedConnectionKey(kind));
  } catch {
    /* nothing to clear */
  }
}

/** The saved copy, if there is a valid, recent one. A bad one is removed. */
export function readSavedConnection(
  kind: Transport['kind'],
  now = Date.now(),
): ConnectionInfo | null {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(savedConnectionKey(kind)) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const record = SavedConnection.safeParse(parsed);
  if (
    !record.success ||
    record.data.savedAt > now + 60_000 ||
    now - record.data.savedAt > SAVED_CONNECTION_MAX_AGE
  ) {
    clearSavedConnection(kind);
    return null;
  }
  return { ...record.data.info };
}

/** How long to wait before checking the connection again while running on the saved copy. */
export function retryDelay(failures: number): number {
  const base = 15_000;
  return Math.min(base * 2 ** Math.max(0, failures - 1), 5 * 60_000);
}
