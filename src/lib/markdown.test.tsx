import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './markdown';

describe('Markdown', () => {
  it('renders basic formatting', () => {
    const { container } = render(
      <Markdown
        source={'# Title\n- **bold** and *it*\n- [x] done\n\n[site](https://example.com)'}
      />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('it');
    expect(container.querySelector('input[type=checkbox]')).toBeChecked();
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
  });

  it('never turns input into markup or unsafe links', () => {
    const { container } = render(
      <Markdown
        source={
          '<img src=x onerror=alert(1)> <script>alert(1)</script>\n[click](javascript:alert(1))'
        }
      />,
    );
    expect(container.querySelector('img, script')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });
});
