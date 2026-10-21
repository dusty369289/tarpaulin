import { fetchAllPages, normalizeBaseUrl, toQueryPairs, type Query } from '../src/canvas/http';
import type { Transport } from '../src/canvas/transport';
import type { ConnectionInfo } from '../src/canvas/types';

/** Reads Canvas from Node using CANVAS_BASE_URL / CANVAS_TOKEN. GET-only, /api/v1/ only. */
export function nodeTransportFromEnv(): { transport: Transport; baseUrl: string } {
  const base = process.env.CANVAS_BASE_URL;
  const token = process.env.CANVAS_TOKEN;
  if (!base || !token) {
    console.error('CANVAS_BASE_URL and CANVAS_TOKEN must be set (see .env.example).');
    process.exit(2);
  }
  const baseUrl = normalizeBaseUrl(base);
  const nope = () => Promise.reject(new Error('not supported from Node'));
  const transport: Transport = {
    kind: 'dev-proxy',
    canManageCredentials: false,
    get: (path: string, query?: Query) => fetchAllPages(baseUrl, token, path, toQueryPairs(query)),
    status: async (): Promise<ConnectionInfo> => ({
      connected: true,
      baseUrl,
      method: 'dev-proxy',
      userName: null,
    }),
    // The smoke and record scripts don't need it, so they make no extra request for it.
    tokenExpiry: async () => ({ status: 'unknown' }),
    connectWithToken: nope,
    connectWithOAuth: nope,
    disconnect: nope,
    openExternal: nope,
    openWebLink: nope,
  };
  return { transport, baseUrl };
}
