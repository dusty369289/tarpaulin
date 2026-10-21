// Personal access token health: telling "Canvas rejected the token" apart from every other
// failure, and reading when the token expires. Mirrors src-tauri/src/canvas.rs, which does the
// same for the desktop app (the token itself never leaves Rust there).

import { normalizeBaseUrl } from './http';

const DAY = 86_400_000;

/** Thrown by the transports when Canvas rejects the credentials themselves. */
export class CanvasAuthError extends Error {
  constructor(message = 'Canvas rejected the credentials (401)') {
    super(message);
    this.name = 'CanvasAuthError';
  }
}

/**
 * Canvas answers 401 both for a bad token ("Invalid access token.", "user authorization
 * required") and for a valid token asking for something it may not see ("user not authorized to
 * perform that action"). Only the first means the token is expired or revoked.
 */
export function isCredentialRejection(status: number, body: string): boolean {
  return status === 401 && !/user not authorized to perform that action/i.test(body);
}

/**
 * True when an error means the credentials no longer work: a rejected token, or an OAuth refresh
 * token Canvas won't accept. Network errors, 5xx, rate limits and permission 401s are not.
 * Tauri rejects with the Rust error's text, so strings are matched as well as error classes.
 */
export function isAuthError(e: unknown): boolean {
  if (e instanceof CanvasAuthError) return true;
  const text = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  if (!text) return false;
  if (/user not authorized to perform that action/i.test(text)) return false;
  return (
    /Canvas rejected the credentials/i.test(text) ||
    /Invalid access token/i.test(text) ||
    /Canvas returned 401\b/.test(text) ||
    /invalid_grant/.test(text)
  );
}

/** What the app knows about the connected token's expiry. */
export type TokenExpiry =
  | { status: 'expires'; expiresAt: string }
  | { status: 'never' }
  /** Canvas wouldn't say (old token without a hint, scoped token, admin-restricted API…). */
  | { status: 'unknown' }
  /** OAuth sign-in refreshes itself, so there's nothing to warn about. */
  | { status: 'not-applicable' };

/**
 * Canvas looks a token up by its "hint": the first five characters of the token's random part.
 * A full token is `<shard id>~<random>`, and the hint comes from after the `~`.
 */
export function tokenHint(token: string): string | null {
  const random = token.trim().split('~').pop() ?? '';
  const hint = random.slice(0, 5);
  // Canvas's are letters and digits; - and _ are allowed too (the mock's tokens) as both are safe
  // in the lookup path.
  return /^[A-Za-z0-9_-]{5}$/.test(hint) ? hint : null;
}

export const tokenLookupPath = (hint: string) => `/api/v1/users/self/tokens/${hint}`;

/**
 * Reads `GET /api/v1/users/self/tokens/:hint`. Canvas doesn't return the hint itself, but
 * `visible_token` is `<shard id>~<hint>...`, which confirms the lookup found this token and not
 * another of the user's tokens.
 */
export function readTokenExpiry(body: unknown, hint: string): TokenExpiry {
  if (!body || typeof body !== 'object') return { status: 'unknown' };
  const { visible_token, expires_at } = body as Record<string, unknown>;
  if (typeof visible_token !== 'string') return { status: 'unknown' };
  const shown = visible_token
    .replace(/\.\.\.$/, '')
    .split('~')
    .pop();
  if (shown !== hint) return { status: 'unknown' };
  if (expires_at === null) return { status: 'never' };
  if (typeof expires_at === 'string' && !Number.isNaN(Date.parse(expires_at)))
    return { status: 'expires', expiresAt: expires_at };
  return { status: 'unknown' };
}

/** Warn this many days ahead, and again closer in. Each one is dismissed separately. */
export const EXPIRY_THRESHOLDS = [14, 3] as const;

export interface ExpiryWarning {
  /** The threshold crossed (14 or 3), or 0 once the expiry has passed. */
  threshold: number;
  /** Whole days left, rounded up (0 when expired). */
  daysLeft: number;
  expiresAt: string;
}

export function expiryWarning(expiry: TokenExpiry | undefined, now: Date): ExpiryWarning | null {
  if (expiry?.status !== 'expires') return null;
  const left = Date.parse(expiry.expiresAt) - now.getTime();
  if (left <= 0) return { threshold: 0, daysLeft: 0, expiresAt: expiry.expiresAt };
  const crossed = EXPIRY_THRESHOLDS.filter((t) => left <= t * DAY);
  if (crossed.length === 0) return null;
  return {
    threshold: Math.min(...crossed),
    daysLeft: Math.ceil(left / DAY),
    expiresAt: expiry.expiresAt,
  };
}

/** Dismissals are remembered per token expiry and threshold, so the 3-day one still shows. */
export const dismissalKey = (w: ExpiryWarning) => `${w.expiresAt}|${w.threshold}`;

/** The user's own Canvas settings page (where tokens are made), once an address is typed. */
export function canvasSettingsUrl(address: string | null | undefined): string | null {
  if (!address?.trim()) return null;
  try {
    const origin = normalizeBaseUrl(address);
    // A bare word ("canvas") isn't a host anyone means yet.
    return new URL(origin).hostname.includes('.') || /localhost|127\.0\.0\.1/.test(origin)
      ? `${origin}/profile/settings`
      : null;
  } catch {
    return null;
  }
}
