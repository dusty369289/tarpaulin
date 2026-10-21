import DOMPurify from 'dompurify';

// Canvas content is HTML written by teachers (and sometimes pasted from anywhere), so it is
// untrusted. It is stored as Canvas sent it and sanitised here, every time it's rendered:
//   - only plain document markup survives (no scripts, styles, forms, frames or handlers);
//   - inline styles and classes are dropped so our own CSS lays it out;
//   - links become inert and carry their resolved URL in data-href, for the reader to open
//     deliberately (Canvas links in-app or in the browser, other sites after a prompt);
//   - Canvas file images carry their file id, so the reader can fetch a signed URL with the
//     token instead of a login-only page;
//   - embedded players (iframe, video, audio) become a link to what they embed.

const TAGS = [
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'caption',
  'code',
  'col',
  'colgroup',
  'dd',
  'del',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'ins',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
];
const ATTRS = [
  'href',
  'src',
  'alt',
  'title',
  'colspan',
  'rowspan',
  'dir',
  'lang',
  'data-api-endpoint',
];
const EMBEDS = 'iframe, video, audio, embed, object';
const FILE_ID = /\/files\/(\d+)(?:[/?#]|$)/;

export interface SanitizeOptions {
  /** The Canvas host, for resolving relative links and recognising Canvas files. */
  baseUrl: string | null;
}

function resolve(href: string | null, base: string | null): URL | null {
  if (!href) return null;
  try {
    return base ? new URL(href, base) : new URL(href);
  } catch {
    return null;
  }
}

const isWeb = (u: URL | null): boolean =>
  !!u && (u.protocol === 'https:' || u.protocol === 'http:');

/** Turns embedded players into a plain link before sanitising (which would drop them silently). */
function replaceEmbeds(doc: Document, base: string | null) {
  for (const el of [...doc.querySelectorAll(EMBEDS)]) {
    const src = resolve(el.getAttribute('src') ?? el.getAttribute('data'), base);
    const p = doc.createElement('p');
    if (src && isWeb(src)) {
      const a = doc.createElement('a');
      a.setAttribute('href', src.href);
      a.textContent = `Embedded content: ${src.hostname}`;
      p.appendChild(a);
    } else {
      p.textContent = '[Embedded content]';
    }
    el.replaceWith(p);
  }
}

export function sanitizeCanvasHtml(html: string, { baseUrl }: SanitizeOptions): string {
  if (!html.trim()) return '';
  const canvasHost = resolve(baseUrl, null)?.host ?? null;
  const pre = new DOMParser().parseFromString(html, 'text/html');
  replaceEmbeds(pre, baseUrl);

  const fragment = DOMPurify.sanitize(pre.body.innerHTML, {
    ALLOWED_TAGS: TAGS,
    ALLOWED_ATTR: ATTRS,
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  }) as DocumentFragment;

  for (const a of fragment.querySelectorAll('a')) {
    const url = resolve(a.getAttribute('href'), baseUrl);
    a.removeAttribute('href');
    if (url && isWeb(url)) {
      a.setAttribute('data-href', url.href);
      a.setAttribute('data-canvas', String(url.host === canvasHost));
      a.setAttribute('href', '#');
      a.setAttribute('title', url.href);
    }
  }
  for (const img of fragment.querySelectorAll('img')) {
    const endpoint = img.getAttribute('data-api-endpoint');
    img.removeAttribute('data-api-endpoint');
    const src = resolve(img.getAttribute('src'), baseUrl);
    const onCanvas = src?.host === canvasHost;
    const fileId =
      (endpoint && FILE_ID.exec(endpoint)?.[1]) ||
      (onCanvas && src && FILE_ID.exec(src.pathname)?.[1]);
    if (fileId) {
      // Fetched with the token by the reader; the original src needs a browser session.
      img.removeAttribute('src');
      img.setAttribute('data-file-id', fileId);
    } else if (src && (isWeb(src) || src.href.startsWith('data:image/'))) {
      img.setAttribute('src', src.href);
    } else {
      img.removeAttribute('src');
    }
    img.setAttribute('loading', 'lazy');
  }
  for (const table of fragment.querySelectorAll('table')) {
    // Wide tables scroll inside their own box instead of widening the reader.
    const wrap = document.createElement('div');
    wrap.setAttribute('data-table-scroll', '');
    table.replaceWith(wrap);
    wrap.appendChild(table);
  }
  const out = document.createElement('div');
  out.appendChild(fragment);
  return out.innerHTML;
}
