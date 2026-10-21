import { describe, expect, it } from 'vitest';
import { HOSTILE_HTML, fileImage, workDescription } from '../../mock-canvas/content';
import { sanitizeCanvasHtml } from './sanitize';

const BASE = 'https://canvas.mock';
const clean = (html: string) => sanitizeCanvasHtml(html, { baseUrl: BASE });
const dom = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = clean(html);
  return div;
};

describe('sanitizeCanvasHtml', () => {
  it('neutralises everything in the hostile body', () => {
    const out = clean(HOSTILE_HTML);
    for (const bad of [
      '<script',
      'onerror',
      'onclick',
      'javascript:',
      '<iframe',
      '<form',
      '<input',
      '<style',
      '<object',
      'style=',
      '<svg',
    ])
      expect(out.toLowerCase()).not.toContain(bad);
    expect(out).toContain('Safe text before.');
    expect(out).toContain('Safe text after');
    // The frame survives only as a link to what it embedded.
    expect(out).toContain('Embedded content: evil.example');
  });

  it('makes links inert and records where they go', () => {
    const div = dom(
      '<a href="/courses/1/pages/intro">Intro</a> <a href="https://example.org/x">Out</a> <a href="mailto:a@b.c">Mail</a>',
    );
    const [canvas, web, mail] = [...div.querySelectorAll('a')];
    expect(canvas.getAttribute('href')).toBe('#');
    expect(canvas.dataset.href).toBe('https://canvas.mock/courses/1/pages/intro');
    expect(canvas.dataset.canvas).toBe('true');
    expect(web.dataset.href).toBe('https://example.org/x');
    expect(web.dataset.canvas).toBe('false');
    expect(mail.hasAttribute('href')).toBe(false);
    expect(mail.dataset.href).toBeUndefined();
  });

  it('turns Canvas file images into file ids, holds back images from other sites', () => {
    const div = dom(
      `${fileImage('12', 345, 'Diagram')}<img src="https://cdn.example.org/a.png" alt="a"><img src="/courses/12/files/678/preview" alt="b"><img src="data:image/png;base64,AAAA" alt="c"><img src="data:text/html;base64,AAAA" alt="d">`,
    );
    const imgs = [...div.querySelectorAll('img')];
    // The data:text/html one has nothing loadable, so it's removed outright.
    expect(imgs).toHaveLength(4);
    const [file, pub, rel, data] = imgs;
    expect(file.dataset.fileId).toBe('345');
    expect(file.hasAttribute('src')).toBe(false);
    expect(file.getAttribute('style')).toBeNull();
    expect(file.getAttribute('alt')).toBe('Diagram');
    // Nothing loads from another site until the reader sets src from data-remote-src.
    expect(pub.hasAttribute('src')).toBe(false);
    expect(pub.dataset.remoteSrc).toBe('https://cdn.example.org/a.png');
    expect(pub.dataset.host).toBe('cdn.example.org');
    expect(rel.dataset.fileId).toBe('678');
    expect(data.getAttribute('src')).toMatch(/^data:image\/png/);
  });

  it('keeps document structure and wraps tables to scroll', () => {
    const div = dom(workDescription('assignment', 'Problem set 3', '12', 30));
    expect(div.querySelector('h2')?.textContent).toBe('Overview');
    expect(div.querySelectorAll('ol li')).toHaveLength(3);
    expect(div.querySelector('[data-table-scroll] > table')).not.toBeNull();
    expect(div.querySelector('[class]')).toBeNull();
  });

  it('handles patterns seen in real course content', () => {
    const div = dom(workDescription('assignment', 'Lab report', '12', 5));
    // Accordions stay accordions.
    expect(div.querySelectorAll('details > summary')).toHaveLength(2);
    // Canvas's hidden labels and icons go (the reader marks outside links itself).
    expect(div.textContent).not.toContain('Links to an external site');
    expect(div.querySelector('[role="presentation"]')).toBeNull();
    // File links are marked; emoji stay inline; src-less Outlook stubs vanish; colours go.
    expect(div.querySelector('a[data-file]')?.textContent).toBe('report-template.docx');
    const imgs = [...div.querySelectorAll('img')];
    expect(imgs.filter((i) => i.hasAttribute('data-inline'))).toHaveLength(1);
    expect(
      imgs.some((i) => !i.hasAttribute('src') && !i.dataset.fileId && !i.dataset.remoteSrc),
    ).toBe(false);
    expect(div.querySelector('[style]')).toBeNull();
  });

  it('keeps images on the Canvas host, turns plain-http images into links', () => {
    const div = dom(
      '<img src="https://canvas.mock/images/emoji/smile.png" alt="smile"><img src="http://old.example.org/pic.jpg" alt="A chart"><img src="http://old.example.org/x.gif">',
    );
    const imgs = [...div.querySelectorAll('img')];
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toBe('https://canvas.mock/images/emoji/smile.png');
    const links = [...div.querySelectorAll('a[data-image-link]')];
    expect(links.map((a) => a.textContent)).toEqual(['Image: A chart', 'Image: old.example.org']);
    expect(links[0].getAttribute('href')).toBe('#');
    expect((links[0] as HTMLElement).dataset.href).toBe('http://old.example.org/pic.jpg');
    expect((links[0] as HTMLElement).dataset.canvas).toBe('false');
  });

  it('labels video embeds', () => {
    const out = clean(
      '<iframe src="https://example.panopto.eu/Panopto/Pages/Embed.aspx?id=x"></iframe>',
    );
    expect(out).toContain('▶ Watch on example.panopto.eu');
  });

  it('handles empty bodies', () => {
    expect(clean('')).toBe('');
    expect(clean('   ')).toBe('');
  });
});
