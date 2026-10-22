import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useSettings } from '../app/settingsStore';
import { useDashboard } from '../dashboard/store';
import { PREPAINT_PLACEHOLDER, prepaintData } from './prepaint';
import { ThemeProvider } from './ThemeProvider';
import { THEMES, type ThemeChoice } from './themes';

// The pre-paint script in index.html, with its colours filled in the way the build does it.
const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)![1];
const prepaint = new Function(
  source.replace(PREPAINT_PLACEHOLDER, JSON.stringify(prepaintData())),
) as () => void;

const KEYS = Object.keys(THEMES.light);
const realMatchMedia = window.matchMedia;

function setSystemDark(dark: boolean) {
  window.matchMedia = ((query: string) => ({
    ...realMatchMedia(query),
    matches: dark && query === '(prefers-color-scheme: dark)',
  })) as typeof window.matchMedia;
}

/** What the theme code has written to <html>. */
function painted() {
  const root = document.documentElement;
  return {
    tokens: Object.fromEntries(KEYS.map((k) => [k, root.style.getPropertyValue(`--${k}`)])),
    theme: root.dataset.theme,
    mode: root.dataset.mode,
    background: root.dataset.background,
    colorScheme: root.style.colorScheme,
  };
}

function clearRoot() {
  const root = document.documentElement;
  root.removeAttribute('style');
  for (const k of Object.keys(root.dataset)) delete root.dataset[k];
}

afterEach(() => {
  window.matchMedia = realMatchMedia;
  clearRoot();
});

describe('pre-paint script', () => {
  const cases: Array<[ThemeChoice, string, string, boolean]> = [
    // theme, default background, page background, system dark
    ['system', 'plain', '', false],
    ['system', 'plain', '', true],
    ['light', 'cork', '', false],
    ['dark', 'cork', '', false],
    ['dark', 'plain', 'night-sky', false],
    ['system', 'blueprint', 'crt', true],
    ['high-contrast', 'poster', 'dots', false],
  ];

  it.each(cases)(
    'paints %s / %s / page %s (system dark: %s) like the app',
    (theme, bg, pageBg, dark) => {
      setSystemDark(dark);
      const dashboard = useDashboard.getState();
      const pages = dashboard.pages.map((p) => ({ ...p, background: pageBg }));
      localStorage.setItem(
        'tarpaulin.settings',
        JSON.stringify({ state: { theme, background: bg }, version: 2 }),
      );
      localStorage.setItem(
        'tarpaulin.dashboard',
        JSON.stringify({ state: { pages, activePageId: dashboard.activePageId }, version: 1 }),
      );
      prepaint();
      const early = painted();

      clearRoot();
      useSettings.setState({ theme, background: bg });
      useDashboard.setState({ pages });
      render(<ThemeProvider>{null}</ThemeProvider>);
      expect(early).toEqual(painted());
      expect(early.tokens.bg).not.toBe('');
    },
  );

  it('falls back quietly when storage holds junk', () => {
    localStorage.setItem('tarpaulin.settings', '{not json');
    expect(() => prepaint()).not.toThrow();
    localStorage.setItem('tarpaulin.settings', JSON.stringify({ state: { theme: 'neon' } }));
    prepaint();
    expect(painted().theme).toBe('light');
  });
});
