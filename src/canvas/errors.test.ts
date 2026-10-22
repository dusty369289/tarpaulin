import { describe, expect, it } from 'vitest';
import { canvasErrorKind, canvasErrorStatus } from './errors';
import { CanvasHttpError, CanvasRateLimitError } from './http';
import { CanvasAuthError } from './token';

describe('canvasErrorKind', () => {
  // Desktop: commands reject with the text of CanvasError in src-tauri/src/canvas.rs.
  it.each([
    ['Canvas rejected the credentials (401)', 'auth'],
    ['Canvas rate limit exceeded (403); try again in a moment', 'rate_limited'],
    [
      'network error: error sending request for url (https://canvas.example.edu/api/v1/courses)',
      'offline',
    ],
    ['Canvas returned 503: {"errors":[{"message":"Service unavailable"}]}', 'server'],
    ['Canvas returned 500: Internal server error', 'server'],
    [
      'Canvas returned 401: {"status":"unauthorized","errors":[{"message":"user not authorized to perform that action"}]}',
      'forbidden',
    ],
    ['Canvas returned 403: {"errors":[{"message":"forbidden"}]}', 'forbidden'],
    [
      'Canvas returned 404: {"errors":[{"message":"The specified resource does not exist."}]}',
      'not_found',
    ],
    ['keychain error: Platform secure storage failure: the keyring is locked', 'keychain'],
    ['unexpected response: expected value at line 1 column 1', 'other'],
    ['not connected to Canvas', 'other'],
  ] as const)('reads the desktop error %j as %s', (message, kind) => {
    expect(canvasErrorKind(message)).toBe(kind);
    expect(canvasErrorKind(new Error(message))).toBe(kind);
  });

  it('reads the browser transports’ errors', () => {
    expect(canvasErrorKind(new CanvasAuthError())).toBe('auth');
    expect(canvasErrorKind(new CanvasRateLimitError(429))).toBe('rate_limited');
    expect(canvasErrorKind(new CanvasHttpError(502, 'Bad gateway'))).toBe('server');
    expect(canvasErrorKind(new CanvasHttpError(404, ''))).toBe('not_found');
    expect(canvasErrorKind(new TypeError('Failed to fetch'))).toBe('offline');
    expect(canvasErrorKind(new TypeError('Load failed'))).toBe('offline');
    // The dev proxy forwards Node's own fetch failure as a 502.
    expect(canvasErrorKind(new Error('fetch failed'))).toBe('offline');
    expect(canvasErrorKind(new Error('Request failed (502)'))).toBe('server');
    expect(canvasErrorKind(undefined)).toBe('other');
  });

  it('finds the status when Canvas answered', () => {
    expect(canvasErrorStatus(new CanvasHttpError(418, ''))).toBe(418);
    expect(canvasErrorStatus('Canvas returned 503: x')).toBe(503);
    expect(canvasErrorStatus('Canvas rate limit exceeded (429); try again in a moment')).toBe(429);
    expect(canvasErrorStatus('network error: timed out')).toBeNull();
  });
});
