import { describe, expect, it } from 'vitest';
import { BACKGROUNDS } from './backgrounds';
import { LOOKS } from './looks';
import { contrast } from './palette';
import { getSkin, hashOf, resolveSkin, SKIN_IDS, SKINS } from './skins';
import { THEMES } from './themes';

// Every style and paper must stay readable: body text and secondary text at WCAG AA for normal
// text, accents and status colours at least AA for large text / UI parts.
const AA = 4.5;
const UI = 3;

describe('widget styles', () => {
  const variants = SKINS.flatMap((skin) =>
    (skin.papers?.length ? skin.papers : [{ id: 'default', tokens: {} }]).map((paper) => ({
      name: `${skin.id}/${paper.id}`,
      t: { ...THEMES.light, ...skin.tokens, ...paper.tokens },
      own: Boolean(skin.tokens),
    })),
  );

  it.each(variants.filter((v) => v.own))('$name text is readable', ({ t }) => {
    expect(contrast(t.text, t.surface)).toBeGreaterThanOrEqual(AA);
    expect(contrast(t.muted, t.surface)).toBeGreaterThanOrEqual(AA);
    expect(contrast(t.text, t['surface-2'])).toBeGreaterThanOrEqual(AA);
    expect(contrast(t['accent-fg'], t.accent)).toBeGreaterThanOrEqual(AA);
  });

  it.each(variants.filter((v) => v.own))('$name accents stand out', ({ t }) => {
    for (const k of ['accent', 'danger', 'warning', 'success'] as const)
      expect(contrast(t[k], t.surface), k).toBeGreaterThanOrEqual(UI);
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
    expect(resolveSkin(postit, 'widget-a', { paper: 'blue' }).tokens?.surface).toBe('191 230 255');
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
  it.each(BACKGROUNDS.filter((b) => b.tokens))('$id chrome is readable', ({ tokens: t }) => {
    expect(contrast(t!.text, t!.surface)).toBeGreaterThanOrEqual(AA);
    expect(contrast(t!.muted, t!.surface)).toBeGreaterThanOrEqual(AA);
    expect(contrast(t!['accent-fg'], t!.accent)).toBeGreaterThanOrEqual(AA);
  });

  it('every look points at a real background and style', () => {
    for (const look of LOOKS) {
      expect(BACKGROUNDS.some((b) => b.id === look.background)).toBe(true);
      expect(SKIN_IDS).toContain(look.widgetStyle);
    }
    expect(LOOKS[0]).toMatchObject({ background: 'plain', widgetStyle: 'card' });
  });
});
