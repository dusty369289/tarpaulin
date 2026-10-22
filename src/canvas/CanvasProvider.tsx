import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CanvasClient } from './client';
import {
  canUseSavedConnection,
  clearSavedConnection,
  readSavedConnection,
  retryDelay,
  saveConnection,
} from './savedConnection';
import { isAuthError } from './token';
import type { Transport } from './transport';
import type { ConnectionInfo } from './types';

interface CanvasContextValue {
  transport: Transport;
  connection: ConnectionInfo | undefined;
  connectionLoading: boolean;
  /** The latest connection check's failure, if it failed. */
  connectionError: Error | null;
  /**
   * The check failed for a reason the cached data may stand in for (offline, 5xx, rate limited),
   * so `connection` is the last one that worked. The check keeps retrying in the background.
   */
  connectionFromCache: boolean;
  client: CanvasClient | null;
  /** Call after connecting or disconnecting. */
  refreshConnection: () => Promise<void>;
  openLink: (url: string | null | undefined) => void;
}

const CanvasContext = createContext<CanvasContextValue | null>(null);

export const CONNECTION_KEY = ['connection'] as const;

/**
 * The transport, except that changing the credentials forgets the saved connection, so one
 * account's details can never stand in for another's (even if the next check fails).
 */
function forgettingTransport(transport: Transport, forget: () => void): Transport {
  const overrides: Pick<Transport, 'disconnect' | 'connectWithToken' | 'connectWithOAuth'> = {
    disconnect: async () => {
      // Before as well as after: a disconnect that fails half way still shouldn't leave it.
      forget();
      await transport.disconnect();
      forget();
    },
    connectWithToken: async (...args) => {
      const info = await transport.connectWithToken(...args);
      forget();
      return info;
    },
    connectWithOAuth: async (...args) => {
      const info = await transport.connectWithOAuth(...args);
      forget();
      return info;
    },
  };
  return new Proxy(transport, {
    get(target, prop) {
      if (Object.prototype.hasOwnProperty.call(overrides, prop))
        return overrides[prop as keyof typeof overrides];
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export function CanvasProvider({
  transport: rawTransport,
  children,
}: {
  transport: Transport;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const kind = rawTransport.kind;
  const [saved, setSaved] = useState(() => readSavedConnection(kind));
  const forget = useCallback(() => {
    clearSavedConnection(kind);
    setSaved(null);
  }, [kind]);
  const transport = useMemo(
    () => forgettingTransport(rawTransport, forget),
    [rawTransport, forget],
  );

  const status = useQuery({
    queryKey: CONNECTION_KEY,
    queryFn: () => transport.status(),
    staleTime: Infinity,
    retry: 1,
    // Running on the saved copy: keep checking, backing off, until Canvas answers.
    refetchInterval: (q) =>
      q.state.status === 'error' && saved && canUseSavedConnection(q.state.error)
        ? retryDelay(q.state.errorUpdateCount)
        : false,
  });

  // Remember each check that worked; forget on a disconnected answer or a rejected token.
  useEffect(() => {
    const info = status.data;
    if (!info) return;
    if (info.connected === true) setSaved(saveConnection(kind, info));
    else if (info.connected === false) forget();
  }, [kind, status.data, status.dataUpdatedAt, forget]);
  useEffect(() => {
    if (status.error && isAuthError(status.error)) forget();
  }, [status.error, forget]);

  const live = status.data;
  const error = status.error;
  // A rejected token or an unreadable keychain never falls back: cached data mustn't hide them.
  // Only the saved copy stands in (not the last answer held in memory), so forgetting it on a
  // disconnect or a new sign-in takes effect even if the next check fails.
  const fallback = error && canUseSavedConnection(error) ? saved : null;
  const connection = fallback ?? live;
  const connectionFromCache = Boolean(fallback);

  // Starting on the saved copy: have the cached Canvas data try again too, so the bar's
  // "Offline" / "Couldn't refresh" chip (or a rejected token's banner) says what's going on.
  useEffect(() => {
    if (connectionFromCache) void queryClient.invalidateQueries({ queryKey: ['canvas'] });
  }, [connectionFromCache, queryClient]);

  const baseUrl = connection?.connected ? connection.baseUrl : null;
  const client = useMemo(
    () => (baseUrl ? new CanvasClient(transport, baseUrl) : null),
    [transport, baseUrl],
  );

  const refreshConnection = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: CONNECTION_KEY });
  }, [queryClient]);

  const openLink = useCallback(
    (url: string | null | undefined) => {
      if (url)
        transport.openExternal(url).catch((e) => console.warn('[canvas] could not open link', e));
    },
    [transport],
  );

  const value = useMemo(
    () => ({
      transport,
      connection,
      connectionLoading: status.isLoading,
      connectionError: error,
      connectionFromCache,
      client,
      refreshConnection,
      openLink,
    }),
    [
      transport,
      connection,
      status.isLoading,
      error,
      connectionFromCache,
      client,
      refreshConnection,
      openLink,
    ],
  );
  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>;
}

export function useCanvas(): CanvasContextValue {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error('useCanvas must be used inside <CanvasProvider>');
  return ctx;
}
