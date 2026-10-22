import DOMPurify from 'dompurify';

// Canvas content is HTML written by teachers (and sometimes pasted from anywhere), so it is
// untrusted. It is stored as Canvas sent it and sanitised here, every time it's rendered:
//   - only plain document markup survives (no scripts, styles, forms, frames or handlers);
//   - inline styles and classes are dropped so our own CSS lays it out;
//   - links become inert and carry their resolved URL in data-href, for the reader to open
//     deliberately (Canvas links in-app or in the browser, other sites after a prompt);
//   - Canvas file images carry their file id, so the reader can fetch a signed URL with the
//     token instead of a login-only page;
//   - images from other sites carry their address in data-remote-src instead of src, so none
//     load until the reader decides to (the user can keep other sites from seeing them read);
//     plain-http images, which the app's CSP would block anyway, become a link to the image;
//   - embedded players (iframe, video, audio) become a link to what they embed;
//   - Canvas's own decorations (the screen-reader "Links to an external site." text and its
//     icon) go, since the reader marks outside links itself.
// The patterns handled here were checked against real course content: accordions built from
// <details>, Outlook and Word pastes, Teams emoji images, file links with verifiers.

const TAGS = [
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'details',
  'summary',
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
  'width',
  'height',
  'open',
  'data-api-endpoint',
];
/** Canvas decorations that only make sense with Canvas's own stylesheet. */
const DECORATIONS = '.screenreader-only, .external_link_icon, .hidden-readable';
/** Images this small are emoji or icons: they sit in the line, unframed. */
const INLINE_IMAGE_PX = 48;
const VIDEO_HOSTS = /youtube|youtu\.be|vimeo|panopto|kaltura|stream\.microsoft|vidgrid|loom/i;
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
      a.textContent = VIDEO_HOSTS.test(src.hostname)
        ? `▶ Watch on ${src.hostname}`
        : `Embedded content: ${src.hostname}`;
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
  for (const el of pre.querySelectorAll(DECORATIONS)) el.remove();

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
      const onCanvas = url.host === canvasHost;
      a.setAttribute('data-href', url.href);
      a.setAttribute('data-canvas', String(onCanvas));
      if (onCanvas && FILE_ID.test(url.pathname)) a.setAttribute('data-file', '');
      a.setAttribute('href', '#');
      a.setAttribute('title', url.href);
    }
  }
  for (const img of [...fragment.querySelectorAll('img')]) {
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
    } else if (src?.href.startsWith('data:image/') || (src?.protocol === 'https:' && onCanvas)) {
      img.setAttribute('src', src.href);
    } else if (src?.protocol === 'https:') {
      img.removeAttribute('src');
      img.setAttribute('data-remote-src', src.href);
      img.setAttribute('data-host', src.host);
    } else if (src?.protocol === 'http:') {
      const a = document.createElement('a');
      a.textContent = `Image: ${img.getAttribute('alt')?.trim() || src.host}`;
      a.setAttribute('href', '#');
      a.setAttribute('title', src.href);
      a.setAttribute('data-href', src.href);
      a.setAttribute('data-canvas', String(onCanvas));
      a.setAttribute('data-image-link', '');
      img.replaceWith(a);
      continue;
    } else {
      // Nothing loadable (Outlook pastes often leave src-less images): show nothing.
      img.remove();
      continue;
    }
    const w = Number(img.getAttribute('width'));
    const h = Number(img.getAttribute('height'));
    if ((w && w <= INLINE_IMAGE_PX) || (h && h <= INLINE_IMAGE_PX))
      img.setAttribute('data-inline', '');
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
