import { hexToTriple } from '../lib/color';
import type { ByMode, ThemeTokens } from './themes';

export type TokenHex = Partial<Record<keyof ThemeTokens, string>>;

/** Hex colours (readable in source) → the "r g b" triples our CSS variables use. */
export function tokens(hex: TokenHex): Partial<ThemeTokens> {
  const out: Partial<ThemeTokens> = {};
  for (const [k, v] of Object.entries(hex)) {
    const triple = v && hexToTriple(v);
    if (!triple) throw new Error(`Bad colour for ${k}: ${v}`);
    out[k as keyof ThemeTokens] = triple;
  }
  return out;
}

/** A light and a dark token set, from hex. */
export function modeTokens(light: TokenHex, dark: TokenHex): ByMode<Partial<ThemeTokens>> {
  return { light: tokens(light), dark: tokens(dark) };
}

/** CSS custom properties for a token set, ready for a `style` prop. */
export function tokenStyle(t: Partial<ThemeTokens>): Record<string, string> {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [`--${k}`, v]));
}

function channel(v: number) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG contrast ratio between two "r g b" triples. */
export function contrast(a: string, b: string): number {
  const lum = (t: string) => {
    const [r, g, bl] = t.split(' ').map(Number);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(bl);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
