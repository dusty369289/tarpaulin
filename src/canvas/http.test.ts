import { describe, expect, it, vi } from 'vitest';
import {
  fetchAllPages,
  isAllowedNext,
  normalizeBaseUrl,
  parseNextLink,
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

  it('refuses disallowed paths before any request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      fetchAllPages('https://c.edu', 't', '/login/oauth2/token', [], fetchImpl),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
