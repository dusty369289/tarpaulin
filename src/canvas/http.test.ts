import { describe, expect, it, vi } from 'vitest';
import {
  CanvasHttpError,
  CanvasRateLimitError,
  fetchAllPages,
  isAllowedNext,
  isThrottled,
  normalizeBaseUrl,
  parseNextLink,
  RETRY,
  retryDelay,
  toQueryPairs,
  validateApiPath,
} from './http';

describe('validateApiPath', () => {
  it('allows plain /api/v1/ paths', () => {
    expect(validateApiPath('/api/v1/courses')).toBe(true);
    expect(validateApiPath('/api/v1/courses/123/assignments')).toBe(true);
  });
  it.each([
    '/api/v2/courses',
    '/login/oauth2/token',
    '/api/v1/../login',
    '/api/v1//evil.com',
    '/api/v1/courses?x=1',
    '/api/v1/%2e%2e/login',
    'https://evil.com/api/v1/courses',
    'api/v1/courses',
  ])('rejects %s', (path) => expect(validateApiPath(path)).toBe(false));
});

describe('query encoding', () => {
  it('expands arrays to key[] pairs and drops empty values', () => {
    expect(
      toQueryPairs({
        include: ['term', 'total_scores'],
        'state[]': ['active'],
        per_page: 100,
        x: undefined,
        y: null,
      }),
    ).toEqual([
      ['include[]', 'term'],
      ['include[]', 'total_scores'],
      ['state[]', 'active'],
      ['per_page', '100'],
    ]);
  });
});

describe('normalizeBaseUrl', () => {
  it('keeps only the origin and requires https except on loopback', () => {
    expect(normalizeBaseUrl('canvas.example.edu/courses')).toBe('https://canvas.example.edu');
    expect(normalizeBaseUrl('http://127.0.0.1:4810')).toBe('http://127.0.0.1:4810');
    expect(() => normalizeBaseUrl('http://canvas.example.edu')).toThrow();
  });
});

describe('Link pagination', () => {
  it('parses rel="next"', () => {
    const header =
      '<https://c.edu/api/v1/courses?page=1>; rel="current",<https://c.edu/api/v1/courses?page=2>; rel="next"';
    expect(parseNextLink(header)).toBe('https://c.edu/api/v1/courses?page=2');
    expect(parseNextLink('<https://c.edu/a>; rel="last"')).toBeNull();
  });
  it('only follows links on the same origin under /api/v1/', () => {
    expect(isAllowedNext('https://c.edu', 'https://c.edu/api/v1/x?page=2')).toBe(true);
    expect(isAllowedNext('https://c.edu', 'https://evil.edu/api/v1/x?page=2')).toBe(false);
    expect(isAllowedNext('https://c.edu', 'https://c.edu/login')).toBe(false);
  });

  const page = (body: unknown, next?: string) =>
    new Response(JSON.stringify(body), { headers: next ? { link: `<${next}>; rel="next"` } : {} });

  it('joins every page and sends the bearer token with GET only', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([1, 2], 'https://c.edu/api/v1/x?page=2'))
      .mockResolvedValueOnce(page([3], 'https://c.edu/api/v1/x?page=3'))
      .mockResolvedValueOnce(page([4]));
    await expect(
      fetchAllPages('https://c.edu', 'tok', '/api/v1/x', [['per_page', '2']], fetchImpl),
    ).resolves.toEqual([1, 2, 3, 4]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init?.method).toBe('GET');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    }
  });

  it('stops instead of sending the token to a foreign next link', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([1], 'https://evil.edu/api/v1/x?page=2'));
    await expect(
      fetchAllPages('https://c.edu', 'tok', '/api/v1/x', [], fetchImpl),
    ).resolves.toEqual([1]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns objects as-is and surfaces HTTP errors', async () => {
    await expect(
      fetchAllPages(
        'https://c.edu',
        't',
        '/api/v1/me',
        [],
        vi.fn<typeof fetch>().mockResolvedValue(page({ id: 1 })),
      ),
    ).resolves.toEqual({ id: 1 });
    const fail = vi.fn<typeof fetch>().mockResolvedValue(new Response('nope', { status: 401 }));
    await expect(fetchAllPages('https://c.edu', 't', '/api/v1/me', [], fail)).rejects.toThrow(
      '401',
    );
  });

  describe('when Canvas throttles', () => {
    const throttled = (headers: Record<string, string> = {}) =>
      new Response('403 Forbidden (Rate Limit Exceeded)', { status: 403, headers });
    const fast = { retry: { attempts: 3, baseMs: 100, maxWaitMs: 1000 } };

    it('waits and tries again, honouring Retry-After', async () => {
      const sleep = vi.fn(async (_ms: number) => {});
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(throttled({ 'x-rate-limit-remaining': '0.0' }))
        .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '0.5' } }))
        .mockResolvedValueOnce(page([1]));
      await expect(
        fetchAllPages('https://c.edu', 't', '/api/v1/x', [], fetchImpl, { ...fast, sleep }),
      ).resolves.toEqual([1]);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      const [[first], [second]] = sleep.mock.calls;
      expect(first).toBeGreaterThanOrEqual(50);
      expect(first).toBeLessThanOrEqual(100);
      expect(second).toBe(500);
    });

    it('gives up with a rate-limit error after the last attempt', async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => throttled());
      const e = await fetchAllPages('https://c.edu', 't', '/api/v1/x', [], fetchImpl, {
        ...fast,
        sleep: async () => {},
      }).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(CanvasRateLimitError);
      expect((e as CanvasRateLimitError).status).toBe(403);
      expect((e as Error).message).toBe('Canvas rate limit exceeded (403); try again in a moment');
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it('does not retry permission errors', async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response('{"errors":[{"message":"forbidden"}]}', {
          status: 403,
          headers: { 'x-rate-limit-remaining': '640.5' },
        }),
      );
      const sleep = vi.fn(async () => {});
      const e = await fetchAllPages('https://c.edu', 't', '/api/v1/x', [], fetchImpl, {
        sleep,
      }).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(CanvasHttpError);
      expect(e).not.toBeInstanceOf(CanvasRateLimitError);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('recognises throttling and backs off with jitter', () => {
      expect(isThrottled(403, null, '{"errors":[{"message":"Rate Limit Exceeded"}]}')).toBe(true);
      expect(isThrottled(403, 0, '')).toBe(true);
      expect(isThrottled(429, null, '')).toBe(true);
      expect(isThrottled(403, 650, 'forbidden')).toBe(false);
      expect(isThrottled(503, 0, 'Rate Limit Exceeded')).toBe(false);
      expect(retryDelay(RETRY, 1, null, 1)).toBe(1000);
      expect(retryDelay(RETRY, 1, null, 0)).toBe(500);
      expect(retryDelay(RETRY, 2, null, 1)).toBe(2000);
      expect(retryDelay(RETRY, 9, null, 1)).toBe(RETRY.maxWaitMs);
      expect(retryDelay(RETRY, 1, 600_000)).toBe(RETRY.maxWaitMs);
    });
  });

  it('refuses disallowed paths before any request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      fetchAllPages('https://c.edu', 't', '/login/oauth2/token', [], fetchImpl),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
