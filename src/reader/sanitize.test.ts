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

  it('turns Canvas file images into file ids, keeps public images', () => {
    const div = dom(
      `${fileImage('12', 345, 'Diagram')}<img src="https://cdn.example.org/a.png" alt="a"><img src="/courses/12/files/678/preview" alt="b"><img src="data:image/png;base64,AAAA" alt="c"><img src="data:text/html;base64,AAAA" alt="d">`,
    );
    const [file, pub, rel, data, bad] = [...div.querySelectorAll('img')];
    expect(file.dataset.fileId).toBe('345');
    expect(file.hasAttribute('src')).toBe(false);
    expect(file.getAttribute('style')).toBeNull();
    expect(file.getAttribute('alt')).toBe('Diagram');
    expect(pub.getAttribute('src')).toBe('https://cdn.example.org/a.png');
    expect(rel.dataset.fileId).toBe('678');
    expect(data.getAttribute('src')).toMatch(/^data:image\/png/);
    expect(bad.hasAttribute('src')).toBe(false);
  });

  it('keeps document structure and wraps tables to scroll', () => {
    const div = dom(workDescription('assignment', 'Problem set 3', '12', 30));
    expect(div.querySelector('h2')?.textContent).toBe('Overview');
    expect(div.querySelectorAll('ol li')).toHaveLength(3);
    expect(div.querySelector('[data-table-scroll] > table')).not.toBeNull();
    expect(div.querySelector('[class]')).toBeNull();
  });

  it('handles empty bodies', () => {
    expect(clean('')).toBe('');
    expect(clean('   ')).toBe('');
  });
});
