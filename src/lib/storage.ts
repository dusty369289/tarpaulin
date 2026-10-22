// Reading and writing small JSON values in localStorage. Storage can be missing or full (private
// windows, locked-down machines), so every access is guarded: a read falls back, a write is
// dropped, and the app carries on with what it has in memory.

/** A plain object (not null, not an array). */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** The value stored under `key`, checked by `parse`; `fallback` when it's missing, unreadable
 *  or `parse` turns it down (returns null). */
export function readJson<T>(
  key: string,
  parse: (raw: unknown) => T | null,
  fallback: T,
  store?: Storage,
): T {
  try {
    const raw = (store ?? localStorage).getItem(key);
    return raw === null ? fallback : (parse(JSON.parse(raw)) ?? fallback);
  } catch {
    return fallback;
  }
}

/** Stores `value` as JSON under `key`; does nothing when storage is unavailable. */
export function writeJson(key: string, value: unknown, store?: Storage) {
  try {
    (store ?? localStorage).setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: kept in memory until the app closes */
  }
}
