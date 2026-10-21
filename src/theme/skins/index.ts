import { blueprint } from './blueprint';
import { card } from './card';
import { indexCard } from './index-card';
import { journal } from './journal';
import { pixel } from './pixel';
import { postit } from './postit';
import { swiss } from './swiss';
import { terminal } from './terminal';
import { modeOf, type Mode, type ThemeName, type ThemeTokens } from '../themes';
import type { Paper, Skin } from './types';
import './shared.css';

// Adding a widget style = one .ts and one .css file in this folder, plus an entry here.
// Each style's files are hashed separately so CI only re-sweeps the styles that changed.
export const SKINS: Skin[] = [card, postit, indexCard, terminal, pixel, swiss, blueprint, journal];
export const SKIN_IDS = SKINS.map((s) => s.id);
export const DEFAULT_SKIN = 'card';

const byId = new Map(SKINS.map((s) => [s.id, s]));
export function getSkin(id: string | undefined): Skin {
  return (id && byId.get(id)) || card;
}

/** Stable small hash so a widget always gets the same paper, tilt and decoration. */
export function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface ResolvedSkin {
  skin: Skin;
  paper: string | null;
  /** The light/dark variant in use; high contrast uses the dark textures. */
  mode: Mode;
  tokens: Partial<ThemeTokens>;
  tilt: number;
  decor: string | null;
}

/**
 * Resolves a skin for one widget: paper (explicit or auto), tilt and decoration from its id, and
 * colours for the theme. High contrast drops the style's colours so widgets use the
 * high-contrast palette, keeping only the style's shape, type and decorations.
 */
export function resolveSkin(
  skin: Skin,
  widgetId: string,
  opts: { paper?: string; tilt?: boolean; theme?: ThemeName } = {},
): ResolvedSkin {
  const theme = opts.theme ?? 'light';
  const mode = modeOf(theme);
  const h = hashOf(widgetId);
  const papers = skin.papers ?? [];
  let paper: Paper | null = papers.find((p) => p.id === opts.paper) ?? null;
  if (!paper && papers.length) paper = skin.mixPapers ? papers[h % papers.length] : papers[0];
  const decor = skin.decor?.length ? skin.decor[(h >>> 8) % skin.decor.length] : null;
  // Spread tilts evenly between -max and +max, never exactly flat.
  const tilt =
    skin.tilt && opts.tilt !== false
      ? Math.round((((h >>> 16) % 1000) / 1000 - 0.5) * 2 * skin.tilt * 10) / 10 || skin.tilt / 2
      : 0;
  return {
    skin,
    paper: paper?.id ?? null,
    mode,
    tokens: theme === 'high-contrast' ? {} : { ...skin.tokens?.[mode], ...paper?.tokens[mode] },
    tilt,
    decor: decor === 'none' ? null : decor,
  };
}

export type { Paper, Skin };
