import { afterEach, describe, expect, it } from 'vitest';
import { CanvasHttpError } from './http';
import {
  SAVED_CONNECTION_MAX_AGE,
  canUseSavedConnection,
  clearSavedConnection,
  readSavedConnection,
  retryDelay,
  saveConnection,
  savedConnectionKey,
} from './savedConnection';
import { CanvasAuthError } from './token';
import type { ConnectionInfo } from './types';

const info: ConnectionInfo = {
  connected: true,
  baseUrl: 'https://canvas.example.edu',
  method: 'token',
  userName: 'Test Student',
};
const key = savedConnectionKey('tauri');
const put = (value: unknown) =>
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));

afterEach(() => localStorage.clear());

describe('saved connection', () => {
  it('round-trips a working connection, and only its four fields', () => {
    saveConnection('tauri', { ...info, token: 'never-stored' } as ConnectionInfo);
    expect(localStorage.getItem(key)).not.toContain('never-stored');
    expect(readSavedConnection('tauri')).toEqual(info);
  });

  it('is kept per transport', () => {
    saveConnection('tauri', info);
    expect(readSavedConnection('dev-proxy')).toBeNull();
  });

  it('a disconnected answer forgets it', () => {
    saveConnection('tauri', info);
    saveConnection('tauri', { connected: false, baseUrl: null, method: null, userName: null });
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('a new account replaces the old one', () => {
    saveConnection('tauri', info);
    saveConnection('tauri', {
      ...info,
      baseUrl: 'https://other.example.org',
      userName: 'Someone Else',
    });
    expect(readSavedConnection('tauri')).toMatchObject({
      baseUrl: 'https://other.example.org',
      userName: 'Someone Else',
    });
    clearSavedConnection('tauri');
    expect(readSavedConnection('tauri')).toBeNull();
  });

  it.each([
    ['not JSON', '{nope'],
    ['a bare string', '"https://canvas.example.edu"'],
    ['no version', { savedAt: Date.now(), info }],
    ['a newer version', { v: 2, savedAt: Date.now(), info }],
    ['not connected', { v: 1, savedAt: Date.now(), info: { ...info, connected: false } }],
    ['no base URL', { v: 1, savedAt: Date.now(), info: { ...info, baseUrl: null } }],
    [
      'a script URL',
      { v: 1, savedAt: Date.now(), info: { ...info, baseUrl: 'javascript:alert(1)' } },
    ],
    ['an unknown method', { v: 1, savedAt: Date.now(), info: { ...info, method: 'magic' } }],
    ['a numeric name', { v: 1, savedAt: Date.now(), info: { ...info, userName: 42 } }],
    ['no date', { v: 1, info }],
    ['too old', { v: 1, savedAt: Date.now() - SAVED_CONNECTION_MAX_AGE - 1, info }],
    ['from the future', { v: 1, savedAt: Date.now() + 86_400_000, info }],
  ])('ignores and removes a saved copy with %s', (_, value) => {
    put(value);
    expect(readSavedConnection('tauri')).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('drops unknown fields from the saved copy', () => {
    put({ v: 1, savedAt: Date.now(), info: { ...info, extra: 'x' }, other: 1 });
    expect(readSavedConnection('tauri')).toEqual(info);
  });

  it('stands in only for failures that are not about the credentials', () => {
    expect(canUseSavedConnection(new TypeError('Failed to fetch'))).toBe(true);
    expect(canUseSavedConnection(new CanvasHttpError(503, 'Service Unavailable'))).toBe(true);
    expect(canUseSavedConnection(new Error('Canvas rate limit exceeded (403)'))).toBe(true);
    expect(canUseSavedConnection(new Error('something odd'))).toBe(true);
    expect(canUseSavedConnection(new CanvasAuthError())).toBe(false);
    expect(canUseSavedConnection('Canvas returned 401: Invalid access token.')).toBe(false);
    expect(canUseSavedConnection('keychain error: the keychain is locked')).toBe(false);
  });

  it('backs off between background checks, up to five minutes', () => {
    expect(retryDelay(1)).toBe(15_000);
    expect(retryDelay(2)).toBe(30_000);
    expect(retryDelay(20)).toBe(300_000);
  });
});
