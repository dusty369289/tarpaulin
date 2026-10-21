import { afterEach, describe, expect, it, vi } from 'vitest';
import { canvasErrorKind } from './errors';
import { CanvasAuthError } from './token';
import { DevProxyTransport, TauriTransport } from './transport';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  invoke.mockReset();
});

describe('DevProxyTransport', () => {
  const stubFetch = (impl: () => Promise<Response>) => {
    const fetchMock = vi.fn(impl);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('GETs through the proxy prefix with the query encoded', async () => {
    const fetchMock = stubFetch(async () => json(200, [{ id: 1 }]));
    await expect(
      new DevProxyTransport().get('/api/v1/courses', { include: ['term'], per_page: 100 }),
    ).resolves.toEqual([{ id: 1 }]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/canvas-proxy/api/v1/courses?include%5B%5D=term&per_page=100',
      { method: 'GET' },
    );
  });

  it('refuses paths outside /api/v1/ before any request', async () => {
    const fetchMock = stubFetch(async () => json(200, {}));
    await expect(new DevProxyTransport().get('/login/oauth2/token')).rejects.toThrow(
      'Not an allowed Canvas API path',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns a rejected token into a CanvasAuthError', async () => {
    stubFetch(async () => json(401, { error: 'Canvas returned 401: Invalid access token.' }));
    await expect(new DevProxyTransport().get('/api/v1/courses')).rejects.toBeInstanceOf(
      CanvasAuthError,
    );
  });

  it('keeps permission 401s, throttling and outages as plain errors with their kind', async () => {
    const cases = [
      [401, 'Canvas returned 401: user not authorized to perform that action', 'forbidden'],
      [403, 'Canvas rate limit exceeded (403); try again in a moment', 'rate_limited'],
      [503, 'Canvas returned 503: {"errors":[{"message":"Service unavailable"}]}', 'server'],
      [502, 'fetch failed', 'offline'],
    ] as const;
    for (const [status, error, kind] of cases) {
      stubFetch(async () => json(status, { error }));
      const e = await new DevProxyTransport().get('/api/v1/courses').catch((x: unknown) => x);
      expect(e).not.toBeInstanceOf(CanvasAuthError);
      expect((e as Error).message).toBe(error);
      expect(canvasErrorKind(e)).toBe(kind);
    }
  });

  it('falls back to the status when the proxy sends no JSON', async () => {
    stubFetch(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    const e = await new DevProxyTransport().get('/api/v1/courses').catch((x: unknown) => x);
    expect((e as Error).message).toBe('Request failed (502)');
    expect(canvasErrorKind(e)).toBe('server');
  });

  it('lets a dropped connection through as offline', async () => {
    stubFetch(async () => Promise.reject(new TypeError('Failed to fetch')));
    const e = await new DevProxyTransport().get('/api/v1/courses').catch((x: unknown) => x);
    expect(canvasErrorKind(e)).toBe('offline');
  });
});

describe('TauriTransport', () => {
  it('sends GETs as canvas_request with query pairs', async () => {
    invoke.mockResolvedValue([]);
    await new TauriTransport().get('/api/v1/planner/items', { context_codes: ['course_1'] });
    expect(invoke).toHaveBeenCalledWith('canvas_request', {
      path: '/api/v1/planner/items',
      query: [['context_codes[]', 'course_1']],
    });
  });

  it('turns the Rust credential error into a CanvasAuthError and passes the rest through', async () => {
    invoke.mockRejectedValueOnce('Canvas rejected the credentials (401)');
    await expect(new TauriTransport().get('/api/v1/courses')).rejects.toBeInstanceOf(
      CanvasAuthError,
    );
    invoke.mockRejectedValueOnce('Canvas rate limit exceeded (403); try again in a moment');
    const e = await new TauriTransport().get('/api/v1/courses').catch((x: unknown) => x);
    expect(e).toBe('Canvas rate limit exceeded (403); try again in a moment');
    expect(canvasErrorKind(e)).toBe('rate_limited');
  });
});
