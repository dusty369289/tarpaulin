// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startMockCanvas, type MockCanvas } from '../../mock-canvas/server';
import { CanvasHttpError, fetchAllPages } from './http';
import {
  CanvasAuthError,
  canvasSettingsUrl,
  dismissalKey,
  expiryWarning,
  isAuthError,
  isCredentialRejection,
  readTokenExpiry,
  tokenHint,
  tokenLookupPath,
} from './token';
import { DevProxyTransport } from './transport';

const DAY = 86_400_000;
const NOW = new Date('2026-03-10T12:00:00Z');
const inDays = (n: number) => ({
  status: 'expires' as const,
  expiresAt: new Date(NOW.getTime() + n * DAY).toISOString(),
});

describe('auth errors', () => {
  it.each([
    new CanvasAuthError(),
    'Canvas rejected the credentials (401)', // what the Tauri command rejects with
    new Error('Canvas returned 401: {"errors":[{"message":"Invalid access token."}]}'),
    new Error('Canvas returned 400: {"error":"invalid_grant"}'), // OAuth refresh refused
  ])('treats %s as a rejected token', (e) => expect(isAuthError(e)).toBe(true));

  it.each([
    new Error('network error: connection refused'),
    'network error: dns error',
    new Error('Canvas returned 500: Internal server error'),
    new Error('Canvas returned 403: Rate Limit Exceeded'),
    new Error('Canvas returned 404: The specified resource does not exist.'),
    new Error(
      'Canvas returned 401: {"status":"unauthorized","errors":[{"message":"user not authorized to perform that action"}]}',
    ),
    new Error('Request failed (502)'),
    null,
    undefined,
    {},
  ])('does not treat %s as a rejected token', (e) => expect(isAuthError(e)).toBe(false));

  it('tells a rejected token from a permission 401', () => {
    expect(isCredentialRejection(401, '{"errors":[{"message":"Invalid access token."}]}')).toBe(
      true,
    );
    expect(isCredentialRejection(401, 'user authorization required')).toBe(true);
    expect(isCredentialRejection(401, 'user not authorized to perform that action')).toBe(false);
    expect(isCredentialRejection(403, 'Invalid access token.')).toBe(false);
  });

  it('the dev proxy transport raises CanvasAuthError only for a rejected token', async () => {
    const reply = (status: number, error: string) =>
      vi.fn(async () => new Response(JSON.stringify({ error }), { status }));
    vi.stubGlobal('fetch', reply(401, 'Canvas returned 401: Invalid access token.'));
    await expect(new DevProxyTransport().get('/api/v1/courses')).rejects.toBeInstanceOf(
      CanvasAuthError,
    );
    vi.stubGlobal('fetch', reply(502, 'fetch failed'));
    const network = await new DevProxyTransport().get('/api/v1/courses').catch((e: unknown) => e);
    expect(isAuthError(network)).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('token hints', () => {
  it('takes five characters after the shard prefix', () => {
    expect(tokenHint('1234~AbCde7890xyz')).toBe('AbCde');
    expect(tokenHint('  AbCde7890xyz ')).toBe('AbCde');
    expect(tokenHint('mock-realistic')).toBe('mock-');
  });
  it('refuses anything that could not be a hint or is unsafe in a path', () => {
    expect(tokenHint('1~abc')).toBeNull();
    expect(tokenHint('1~ab/cd')).toBeNull();
    expect(tokenHint('1~..abc')).toBeNull();
    expect(tokenHint('')).toBeNull();
  });
});

describe('reading the token endpoint', () => {
  const body = (visible: string, expires: string | null) => ({
    id: 1,
    visible_token: visible,
    expires_at: expires,
  });
  it('reads a dated token', () => {
    expect(readTokenExpiry(body('7~AbCde...', '2026-04-01T00:00:00Z'), 'AbCde')).toEqual({
      status: 'expires',
      expiresAt: '2026-04-01T00:00:00Z',
    });
  });
  it('reads a token with no expiry', () => {
    expect(readTokenExpiry(body('AbCde...', null), 'AbCde')).toEqual({ status: 'never' });
  });
  it('is unknown when the lookup found another token or an odd body', () => {
    expect(readTokenExpiry(body('7~Zzzzz...', null), 'AbCde')).toEqual({ status: 'unknown' });
    expect(readTokenExpiry({ expires_at: null }, 'AbCde')).toEqual({ status: 'unknown' });
    expect(readTokenExpiry(body('7~AbCde...', 'soon'), 'AbCde')).toEqual({ status: 'unknown' });
    expect(readTokenExpiry([], 'AbCde')).toEqual({ status: 'unknown' });
    expect(readTokenExpiry(null, 'AbCde')).toEqual({ status: 'unknown' });
  });
});

describe('expiry warnings', () => {
  it('says nothing for a token with no expiry, an unknown one, or one far off', () => {
    expect(expiryWarning({ status: 'never' }, NOW)).toBeNull();
    expect(expiryWarning({ status: 'unknown' }, NOW)).toBeNull();
    expect(expiryWarning({ status: 'not-applicable' }, NOW)).toBeNull();
    expect(expiryWarning(undefined, NOW)).toBeNull();
    expect(expiryWarning(inDays(15), NOW)).toBeNull();
  });
  it('warns at 14 days, then again at 3', () => {
    expect(expiryWarning(inDays(14), NOW)).toMatchObject({ threshold: 14, daysLeft: 14 });
    expect(expiryWarning(inDays(10), NOW)).toMatchObject({ threshold: 14, daysLeft: 10 });
    expect(expiryWarning(inDays(3.01), NOW)).toMatchObject({ threshold: 14, daysLeft: 4 });
    expect(expiryWarning(inDays(3), NOW)).toMatchObject({ threshold: 3, daysLeft: 3 });
    expect(expiryWarning(inDays(0.2), NOW)).toMatchObject({ threshold: 3, daysLeft: 1 });
  });
  it('reports an expiry that has passed', () => {
    expect(expiryWarning(inDays(-1), NOW)).toMatchObject({ threshold: 0, daysLeft: 0 });
  });
  it('dismisses each threshold separately', () => {
    const early = expiryWarning(inDays(10), NOW)!;
    const late = expiryWarning(inDays(2), NOW)!;
    expect(dismissalKey(early)).not.toBe(dismissalKey(late));
    // A new token with a new date shows its warnings again.
    expect(dismissalKey(early)).not.toBe(dismissalKey(expiryWarning(inDays(11), NOW)!));
  });
});

describe('Canvas settings link', () => {
  it('links to the typed Canvas host', () => {
    expect(canvasSettingsUrl('canvas.example.edu')).toBe(
      'https://canvas.example.edu/profile/settings',
    );
    expect(canvasSettingsUrl('https://canvas.example.edu/courses/12')).toBe(
      'https://canvas.example.edu/profile/settings',
    );
  });
  it('has no link until the address looks like a host', () => {
    expect(canvasSettingsUrl('')).toBeNull();
    expect(canvasSettingsUrl('canvas')).toBeNull();
    expect(canvasSettingsUrl('http://canvas.example.edu')).toBeNull();
    expect(canvasSettingsUrl('javascript:alert(1)')).toBeNull();
  });
});

// The mock Canvas implements the same lookup, with a token for each case.
describe('mock Canvas token endpoint', () => {
  let mock: MockCanvas;
  beforeAll(async () => {
    mock = await startMockCanvas({ now: NOW });
  });
  afterAll(() => mock.close());
  const lookup = async (token: string) => {
    const hint = tokenHint(token)!;
    return readTokenExpiry(await fetchAllPages(mock.url, token, tokenLookupPath(hint), []), hint);
  };

  it('a token expiring soon', async () => {
    const expiry = await lookup('mock-expiring-10d');
    expect(expiry).toEqual(inDays(10));
    expect(expiryWarning(expiry, NOW)).toMatchObject({ threshold: 14, daysLeft: 10 });
  });
  it('a token with no expiry', async () => {
    expect(await lookup('mock-realistic')).toEqual({ status: 'never' });
  });
  it('an expired or revoked token is rejected everywhere', async () => {
    for (const path of [tokenLookupPath('mock-'), '/api/v1/courses']) {
      const e = await fetchAllPages(mock.url, 'mock-expired', path, []).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(CanvasHttpError);
      expect(isCredentialRejection((e as CanvasHttpError).status, (e as Error).message)).toBe(true);
      expect(isAuthError(e)).toBe(true);
    }
  });
  it('a wrong hint is not found', async () => {
    const e = await fetchAllPages(mock.url, 'mock-realistic', tokenLookupPath('Zzzzz'), []).catch(
      (x: unknown) => x,
    );
    expect((e as CanvasHttpError).status).toBe(404);
    expect(isAuthError(e)).toBe(false);
  });
  it('the token lookup is read-only', () => expect(mock.writes).toEqual([]));
});
