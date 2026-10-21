import type { Query } from './http';
import type { Resource, Urls } from './resource';
import type { Transport } from './transport';

/** Turns Canvas HTML into readable plain text without ever inserting it into the DOM as markup. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  const withBreaks = html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n');
  let text: string;
  if (typeof DOMParser !== 'undefined') {
    text = new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent ?? '';
  } else {
    text = withBreaks
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

/** Loads any Resource through a transport, for one Canvas account. */
export class CanvasClient implements Urls {
  readonly baseUrl: string;

  constructor(
    private transport: Transport,
    baseUrl: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  absolute = (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (/^https?:\/\//.test(url)) return url;
    return `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  fetch<T>(resource: Resource<T>): Promise<T> {
    return resource.load((path: string, query?: Query) => this.transport.get(path, query), this);
  }
}
