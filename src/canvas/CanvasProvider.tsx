import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { CanvasClient } from './client';
import type { Transport } from './transport';
import type { ConnectionInfo } from './types';

interface CanvasContextValue {
  transport: Transport;
  connection: ConnectionInfo | undefined;
  connectionLoading: boolean;
  connectionError: Error | null;
  client: CanvasClient | null;
  /** Call after connecting or disconnecting. */
  refreshConnection: () => Promise<void>;
  openLink: (url: string | null | undefined) => void;
}

const CanvasContext = createContext<CanvasContextValue | null>(null);

export const CONNECTION_KEY = ['connection'] as const;

export function CanvasProvider({
  transport,
  children,
}: {
  transport: Transport;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: CONNECTION_KEY,
    queryFn: () => transport.status(),
    staleTime: Infinity,
    retry: 1,
  });
  const connection = status.data;
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
      connectionError: status.error,
      client,
      refreshConnection,
      openLink,
    }),
    [transport, connection, status.isLoading, status.error, client, refreshConnection, openLink],
  );
  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>;
}

export function useCanvas(): CanvasContextValue {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error('useCanvas must be used inside <CanvasProvider>');
  return ctx;
}
