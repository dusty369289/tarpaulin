import type { Query } from '../canvas/http';
import { DevProxyTransport, type Transport } from '../canvas/transport';
import type { ConnectionInfo } from '../canvas/types';

// Dev-only (`/?demo`): shows the desktop onboarding flow in a browser. "Connecting" accepts any
// address and token, then reads Canvas through the dev proxy (normally pointed at the mock
// Canvas). Used to record the product demo video; never part of a production build.

const KEY = 'tarpaulin.demo.connection';

export class DemoTransport implements Transport {
  readonly kind = 'dev-proxy' as const;
  readonly canManageCredentials = true;
  private proxy = new DevProxyTransport();

  get(path: string, query?: Query) {
    return this.proxy.get(path, query);
  }
  async status(): Promise<ConnectionInfo> {
    const saved = sessionStorage.getItem(KEY);
    return saved
      ? (JSON.parse(saved) as ConnectionInfo)
      : { connected: false, baseUrl: null, method: null, userName: null };
  }
  async connectWithToken(baseUrl: string, token: string): Promise<ConnectionInfo> {
    await new Promise((r) => setTimeout(r, 700));
    if (!token.trim()) throw new Error('Canvas rejected the credentials (401)');
    const host = baseUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const info: ConnectionInfo = {
      connected: true,
      baseUrl: `https://${host}`,
      method: 'token',
      userName: null,
    };
    sessionStorage.setItem(KEY, JSON.stringify(info));
    return info;
  }
  async connectWithOAuth(baseUrl: string): Promise<ConnectionInfo> {
    return this.connectWithToken(baseUrl, 'oauth');
  }
  async disconnect() {
    sessionStorage.removeItem(KEY);
  }
  async openExternal() {}
}
