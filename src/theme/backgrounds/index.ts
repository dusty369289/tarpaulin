import { tokens } from '../palette';
import type { ThemeTokens } from '../themes';
import './backgrounds.css';

/**
 * A page background. Textured backgrounds bring their own colours for the app chrome (header,
 * menus, settings) so text stays readable on them; plain follows light/dark mode.
 */
export interface Background {
  id: string;
  name: string;
  /** Chrome colours; omitted for plain, which uses the light/dark/high-contrast theme. */
  tokens?: ThemeTokens;
  dark?: boolean;
  /** CSS background for the picker swatch. */
  swatch: string;
}

const chrome = (t: Record<keyof ThemeTokens, string>) => tokens(t) as ThemeTokens;

export const BACKGROUNDS: Background[] = [
  // Plain follows light/dark mode, so its swatch shows both.
  { id: 'plain', name: 'Plain', swatch: 'linear-gradient(135deg, #f4f5f7 50%, #181b23 50%)' },
  {
    id: 'cork',
    name: 'Cork board',
    swatch: '#b07a4e',
    tokens: chrome({
      bg: '#b07a4e',
      surface: '#fdfaf2',
      'surface-2': '#f1e9d8',
      border: '#d9cbb1',
      text: '#2b2118',
      muted: '#6b5a48',
      accent: '#a3231b',
      'accent-fg': '#ffffff',
      danger: '#a3231b',
      warning: '#7a4d00',
      success: '#1d6b34',
    }),
  },
  {
    id: 'dots',
    name: 'Dot grid',
    swatch: '#f7f1e3',
    tokens: chrome({
      bg: '#f7f1e3',
      surface: '#fffdf7',
      'surface-2': '#f1e9d6',
      border: '#d9cfb8',
      text: '#2d2a32',
      muted: '#615a66',
      accent: '#b23f27',
      'accent-fg': '#ffffff',
      danger: '#b23f27',
      warning: '#7a5300',
      success: '#2f6b4c',
    }),
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    swatch: '#0f4c81',
    dark: true,
    tokens: chrome({
      bg: '#0f4c81',
      surface: '#0d3d68',
      'surface-2': '#15528a',
      border: '#3f78ad',
      text: '#eaf4ff',
      muted: '#b4d4f3',
      accent: '#ffe08a',
      'accent-fg': '#0f4c81',
      danger: '#ffb3a6',
      warning: '#ffe08a',
      success: '#a8f0c6',
    }),
  },
  {
    id: 'crt',
    name: 'CRT',
    swatch: '#050a06',
    dark: true,
    tokens: chrome({
      bg: '#050a06',
      surface: '#08140b',
      'surface-2': '#0f2616',
      border: '#1f7a3c',
      text: '#7dffa3',
      muted: '#3fcf6b',
      accent: '#49ff7d',
      'accent-fg': '#050a06',
      danger: '#ff6b6b',
      warning: '#ffd23f',
      success: '#49ff7d',
    }),
  },
  {
    id: 'night-sky',
    name: 'Night sky',
    swatch: '#2a1a5e',
    dark: true,
    tokens: chrome({
      bg: '#2a1a5e',
      surface: '#1f1347',
      'surface-2': '#34237a',
      border: '#5a46a8',
      text: '#f4f1ff',
      muted: '#c9bfff',
      accent: '#ffd23f',
      'accent-fg': '#1b1238',
      danger: '#ff8080',
      warning: '#ffd23f',
      success: '#7cf2a8',
    }),
  },
  {
    id: 'poster',
    name: 'Poster',
    swatch: '#f2efe8',
    tokens: chrome({
      bg: '#f2efe8',
      surface: '#f2efe8',
      'surface-2': '#e3dfd5',
      border: '#111111',
      text: '#111111',
      muted: '#57524a',
      accent: '#d10511',
      'accent-fg': '#ffffff',
      danger: '#d10511',
      warning: '#7a4d00',
      success: '#1d6b34',
    }),
  },
];
export const BACKGROUND_IDS = BACKGROUNDS.map((b) => b.id);
export const DEFAULT_BACKGROUND = 'plain';

export function getBackground(id: string | undefined): Background {
  return BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0];
}
