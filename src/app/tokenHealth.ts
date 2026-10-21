import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { useCanvas } from '../canvas/CanvasProvider';
import {
  dismissalKey,
  expiryWarning,
  isAuthError,
  type ExpiryWarning,
  type TokenExpiry,
} from '../canvas/token';

// The app-side half of token health: is Canvas rejecting the token right now, and when does it
// expire. Detection rules live in src/canvas/token.ts.

const SIX_HOURS = 6 * 60 * 60_000;
const DISMISSED_KEY = 'tarpaulin.tokenWarnings';

/**
 * True while any Canvas query's latest result is "the token was rejected". It stays true through
 * retries (a query in flight keeps its error) and clears only when a request succeeds again.
 */
export function useAuthFailure(): boolean {
  const cache = useQueryClient().getQueryCache();
  return useSyncExternalStore(
    useCallback((onChange) => cache.subscribe(onChange), [cache]),
    () => cache.getAll().some((q) => q.state.status === 'error' && isAuthError(q.state.error)),
  );
}

/** The connected token's expiry. OAuth refreshes itself and fixtures have no token. */
export function useTokenExpiry() {
  const { transport, connection } = useCanvas();
  const applies =
    Boolean(connection?.connected) &&
    (connection?.method === 'token' || connection?.method === 'dev-proxy');
  return useQuery<TokenExpiry>({
    queryKey: ['token-expiry', connection?.baseUrl],
    queryFn: () => transport.tokenExpiry(),
    enabled: applies,
    staleTime: SIX_HOURS,
    refetchInterval: SIX_HOURS,
  });
}

function readDismissed(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** The expiry warning to show now, if any, and a way to dismiss it (until the next threshold). */
export function useExpiryWarning(now = new Date()): {
  warning: ExpiryWarning | null;
  dismiss: () => void;
} {
  const { data } = useTokenExpiry();
  const [dismissed, setDismissed] = useState(readDismissed);
  const warning = expiryWarning(data, now);
  const visible = warning && !dismissed.includes(dismissalKey(warning)) ? warning : null;
  const dismiss = () => {
    if (!warning) return;
    const next = [...dismissed, dismissalKey(warning)].slice(-10);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      /* private mode: dismissed for this session only */
    }
  };
  return { warning: visible, dismiss };
}

/**
 * After the token is replaced: refetch everything, including queries no widget is showing, so no
 * stale "rejected" error keeps the banner up.
 */
export function useAfterTokenChange() {
  const queryClient = useQueryClient();
  const { refreshConnection } = useCanvas();
  return useCallback(async () => {
    await refreshConnection();
    await queryClient.invalidateQueries({ refetchType: 'all' });
  }, [queryClient, refreshConnection]);
}
