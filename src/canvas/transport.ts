import { invoke } from '../app/ipc';
import { assertApiPath, encodePairs, toQueryPairs, type Query } from './http';
import { CanvasAuthError, isAuthError, isCredentialRejection, type TokenExpiry } from './token';
import type { ConnectionInfo } from './types';

/**
 * Everything the app needs from "a way to reach Canvas". Data access is GET-only by construction:
 * there is no method that could write to Canvas.
 */
export interface Transport {
  readonly kind: 'tauri' | 'dev-proxy' | 'fixtures';
  get(path: string, query?: Query): Promise<unknown>;
  status(): Promise<ConnectionInfo>;
  /** When the connected access token expires, if Canvas will say (see src/canvas/token.ts). */
  tokenExpiry(): Promise<TokenExpiry>;
  /** Only the Tauri transport manages credentials; the others are configured externally. */
  readonly canManageCredentials: boolean;
  connectWithToken(baseUrl: string, token: string): Promise<ConnectionInfo>;
  connectWithOAuth(
    baseUrl: string,
    clientId: string,
    clientSecret: string,
  ): Promise<ConnectionInfo>;
  disconnect(): Promise<void>;
  /** Opens a page on the connected Canvas host in the system browser. */
  openExternal(url: string): Promise<void>;
  /** Opens any http(s) page in the system browser. Callers confirm with the user first. */
  openWebLink(url: string): Promise<void>;
}

const unsupported = (what: string) => () =>
  Promise.reject(new Error(`${what} is only available in the desktop app.`));

/** Talks to Canvas through Rust commands; tokens stay in the OS keychain. */
export class TauriTransport implements Transport {
  readonly kind = 'tauri' as const;
  readonly canManageCredentials = true;

  private async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    try {
      return await invoke<T>(cmd, args);
    } catch (e) {
      // Commands reject with the Rust error's text; a rejected token gets its own class.
      throw isAuthError(e) ? new CanvasAuthError(String(e)) : e;
    }
  }

  get(path: string, query?: Query) {
    assertApiPath(path);
    return this.invoke<unknown>('canvas_request', { path, query: toQueryPairs(query) });
  }
  status() {
    return this.invoke<ConnectionInfo>('auth_status');
  }
  tokenExpiry() {
    return this.invoke<TokenExpiry>('token_expiry');
  }
  connectWithToken(baseUrl: string, token: string) {
    return this.invoke<ConnectionInfo>('save_token', { baseUrl, token });
  }
  connectWithOAuth(baseUrl: string, clientId: string, clientSecret: string) {
    return this.invoke<ConnectionInfo>('oauth_login', { baseUrl, clientId, clientSecret });
  }
  disconnect() {
    return this.invoke<void>('logout');
  }
  openExternal(url: string) {
    return this.invoke<void>('open_external', { url });
  }
  openWebLink(url: string) {
    return this.invoke<void>('open_web_link', { url });
  }
}

/** Dev-only: reads live Canvas through the Vite middleware, which holds the token server-side. */
export class DevProxyTransport implements Transport {
  readonly kind = 'dev-proxy' as const;
  readonly canManageCredentials = false;

  constructor(private prefix = '/canvas-proxy') {}

  async get(path: string, query?: Query) {
    assertApiPath(path);
    const qs = encodePairs(toQueryPairs(query));
    const res = await fetch(`${this.prefix}${path}${qs ? `?${qs}` : ''}`, { method: 'GET' });
    return this.read(res);
  }
  async status(): Promise<ConnectionInfo> {
    // A failed status request (the proxy down, a 5xx) is an error, not an answer of "not connected".
    return (await this.read(await fetch(`${this.prefix}/status`))) as ConnectionInfo;
  }
  async tokenExpiry() {
    return (await this.read(await fetch(`${this.prefix}/token-expiry`))) as TokenExpiry;
  }
  private async read(res: Response): Promise<unknown> {
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body;
    const message = (body as { error?: string }).error ?? `Request failed (${res.status})`;
    throw isCredentialRejection(res.status, message)
      ? new CanvasAuthError(message)
      : new Error(message);
  }
  connectWithToken = unsupported('Connecting');
  connectWithOAuth = unsupported('Connecting');
  disconnect = unsupported('Disconnecting');
  async openExternal(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  async openWebLink(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export interface FixtureBundle {
  meta: { recordedAt: string; baseUrl: string };
  responses: Record<string, unknown>;
}

/** Serves anonymised recorded responses, keyed by path (query ignored). Used by tests. */
export class FixtureTransport implements Transport {
  readonly kind = 'fixtures' as const;
  readonly canManageCredentials = false;
  readonly requests: Array<{ path: string; query?: Query }> = [];

  constructor(private bundle: FixtureBundle) {}

  async get(path: string, query?: Query) {
    assertApiPath(path);
    this.requests.push({ path, query });
    return structuredClone(this.bundle.responses[path] ?? []);
  }
  async status(): Promise<ConnectionInfo> {
    return {
      connected: true,
      baseUrl: this.bundle.meta.baseUrl,
      method: 'fixtures',
      userName: null,
    };
  }
  async tokenExpiry(): Promise<TokenExpiry> {
    return { status: 'unknown' };
  }
  connectWithToken = unsupported('Connecting');
  connectWithOAuth = unsupported('Connecting');
  disconnect = unsupported('Disconnecting');
  async openExternal() {}
  async openWebLink() {}
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function createDefaultTransport(): Promise<Transport> {
  if (isTauri()) return new TauriTransport();
  if (import.meta.env.VITE_TRANSPORT === 'fixtures') {
    const { default: bundle } = await import('./fixtures/canvas.json');
    return new FixtureTransport(bundle as FixtureBundle);
  }
  return new DevProxyTransport();
}
