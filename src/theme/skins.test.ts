import { describe, expect, it } from 'vitest';
import { BACKGROUNDS } from './backgrounds';
import { LOOKS } from './looks';
import { contrast } from './palette';
import { getSkin, hashOf, resolveSkin, SKIN_IDS, SKINS } from './skins';
import { MODES, THEMES, type ThemeTokens } from './themes';

// Every style, paper and background must stay readable in both modes: body text and secondary
// text at WCAG AA for normal text, accents and status colours at least AA for large text / UI
// parts.
const AA = 4.5;
const UI = 3;

function expectReadable(t: ThemeTokens) {
  expect(contrast(t.text, t.surface), 'text').toBeGreaterThanOrEqual(AA);
  expect(contrast(t.muted, t.surface), 'muted').toBeGreaterThanOrEqual(AA);
  expect(contrast(t.text, t['surface-2']), 'text on surface-2').toBeGreaterThanOrEqual(AA);
  expect(contrast(t['accent-fg'], t.accent), 'accent-fg').toBeGreaterThanOrEqual(AA);
  for (const k of ['accent', 'danger', 'warning', 'success'] as const)
    expect(contrast(t[k], t.surface), k).toBeGreaterThanOrEqual(UI);
}

describe('widget styles', () => {
  // Each style, paper and mode, resolved the way a widget resolves it, on top of that mode's
  // theme (the tokens a style leaves out inherit it).
  const variants = SKINS.flatMap((skin) =>
    MODES.flatMap((mode) =>
      (skin.papers?.length ? skin.papers.map((p) => p.id) : ['default']).map((paper) => ({
        name: `${skin.id}/${paper}/${mode}`,
        t: {
          ...THEMES[mode],
          ...resolveSkin(skin, 'x', { paper, theme: mode }).tokens,
        } as ThemeTokens,
      })),
    ),
  );

  it.each(variants)('$name is readable', ({ t }) => expectReadable(t));

  it('gives every style, paper and swatch a light and a dark variant', () => {
    for (const skin of SKINS) {
      expect(skin.swatch.light && skin.swatch.dark, skin.id).toBeTruthy();
      expect(skin.swatch.light, skin.id).not.toBe(skin.swatch.dark);
      if (skin.tokens) expect(skin.tokens.light, skin.id).not.toEqual(skin.tokens.dark);
      for (const p of skin.papers ?? []) {
        expect(p.swatch.light, `${skin.id}/${p.id}`).not.toBe(p.swatch.dark);
        const light = resolveSkin(skin, 'x', { paper: p.id, theme: 'light' }).tokens;
        const dark = resolveSkin(skin, 'x', { paper: p.id, theme: 'dark' }).tokens;
        expect(light.surface, `${skin.id}/${p.id}`).not.toBe(dark.surface);
      }
    }
  });

  it('follows the mode, and high contrast drops the style colours', () => {
    const postit = getSkin('postit');
    const light = resolveSkin(postit, 'w', { paper: 'yellow', theme: 'light' });
    const dark = resolveSkin(postit, 'w', { paper: 'yellow', theme: 'dark' });
    const hc = resolveSkin(postit, 'w', { paper: 'yellow', theme: 'high-contrast' });
    expect(light.mode).toBe('light');
    expect(dark.mode).toBe('dark');
    expect(light.tokens.surface).toBe('255 242 122');
    expect(dark.tokens.surface).not.toBe(light.tokens.surface);
    expect(hc.mode).toBe('dark');
    expect(hc.tokens).toEqual({});
    // Shape survives: same paper, tilt and decoration in every mode.
    expect([dark.paper, dark.tilt, dark.decor]).toEqual([light.paper, light.tilt, light.decor]);
    expect([hc.paper, hc.tilt, hc.decor]).toEqual([light.paper, light.tilt, light.decor]);
  });

  it('has unique ids and falls back to the card style', () => {
    expect(new Set(SKIN_IDS).size).toBe(SKIN_IDS.length);
    expect(getSkin('nope').id).toBe('card');
    expect(getSkin(undefined).id).toBe('card');
  });

  it('resolves paper, tilt and decoration deterministically per widget', () => {
    const postit = getSkin('postit');
    const a = resolveSkin(postit, 'widget-a');
    expect(resolveSkin(postit, 'widget-a')).toEqual(a);
    expect(Math.abs(a.tilt)).toBeLessThanOrEqual(postit.tilt!);
    expect(a.tilt).not.toBe(0);
    // Mixed papers spread across widgets.
    const papers = new Set(
      Array.from({ length: 40 }, (_, i) => resolveSkin(postit, `w${i}`).paper),
    );
    expect(papers.size).toBeGreaterThan(3);
    // An explicit paper wins; tilt can be switched off.
    expect(resolveSkin(postit, 'widget-a', { paper: 'blue' }).paper).toBe('blue');
    expect(resolveSkin(postit, 'widget-a', { tilt: false }).tilt).toBe(0);
    expect(resolveSkin(postit, 'widget-a', { paper: 'blue' }).tokens.surface).toBe('191 230 255');
  });

  it('keeps flat styles flat', () => {
    for (const id of ['card', 'terminal', 'swiss', 'pixel', 'blueprint'])
      expect(resolveSkin(getSkin(id), 'x').tilt).toBe(0);
  });

  it('hashes stably', () => {
    expect(hashOf('abc')).toBe(hashOf('abc'));
    expect(hashOf('abc')).not.toBe(hashOf('abd'));
  });
});

describe('backgrounds and looks', () => {
  const chrome = BACKGROUNDS.filter((b) => b.tokens).flatMap((b) =>
    MODES.map((mode) => ({ name: `${b.id}/${mode}`, t: b.tokens![mode] })),
  );
  it.each(chrome)('$name chrome is readable', ({ t }) => expectReadable(t));

  it('gives every background a light and a dark variant', () => {
    for (const b of BACKGROUNDS) {
      expect(b.swatch.light, b.id).not.toBe(b.swatch.dark);
      if (b.tokens) expect(b.tokens.light.bg, b.id).not.toBe(b.tokens.dark.bg);
    }
  });

  it('every look points at a real background and style', () => {
    for (const look of LOOKS) {
      expect(BACKGROUNDS.some((b) => b.id === look.background)).toBe(true);
      expect(SKIN_IDS).toContain(look.widgetStyle);
    }
    expect(LOOKS[0]).toMatchObject({ background: 'plain', widgetStyle: 'card' });
  });
});

describe('CI theme sweep', () => {
  it('has one matrix job per widget style', async () => {
    const { readFileSync } = await import('node:fs');
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    const list = ci
      .match(/style: \[([^\]]+)\]/)?.[1]
      .split(',')
      .map((s) => s.trim());
    expect(list?.sort()).toEqual([...SKIN_IDS].sort());
  });
});
