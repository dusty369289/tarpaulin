import { tokens } from '../palette';
import type { ByMode, ThemeTokens } from '../themes';

/**
 * A page background. Textured backgrounds bring their own colours for the app chrome (header,
 * menus, settings) so text stays readable on them, one set per mode; backgrounds.css paints each
 * mode's texture from <html data-background data-mode> (index.ts imports it). Plain uses the
 * theme itself, and high contrast always overrides the chrome.
 */
export interface Background {
  id: string;
  name: string;
  /** Chrome colours per mode; omitted for plain, which uses the light/dark/high-contrast theme. */
  tokens?: ByMode<ThemeTokens>;
  /** CSS background for the picker swatch of plain (textured ones use .bg-pattern-<id>). */
  swatch: ByMode<string>;
}

type Chrome = Record<keyof ThemeTokens, string>;
const chrome = (light: Chrome, dark: Chrome): ByMode<ThemeTokens> => ({
  light: tokens(light) as ThemeTokens,
  dark: tokens(dark) as ThemeTokens,
});

export const BACKGROUNDS: Background[] = [
  { id: 'plain', name: 'Plain', swatch: { light: '#f4f5f7', dark: '#0f1117' } },
  {
    // Light: natural cork. Dark: charred cork on a walnut frame.
    id: 'cork',
    name: 'Cork board',
    swatch: { light: '#b07a4e', dark: '#45301f' },
    tokens: chrome(
      {
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
      },
      {
        bg: '#45301f',
        surface: '#241a13',
        'surface-2': '#33261c',
        border: '#5a4434',
        text: '#f3e9da',
        muted: '#c9b8a2',
        accent: '#ffa08f',
        'accent-fg': '#2a1a12',
        danger: '#ffa08f',
        warning: '#ffd27a',
        success: '#a3e6ae',
      },
    ),
  },
  {
    // Light: cream dot-grid paper. Dark: charcoal paper with grey dots.
    id: 'dots',
    name: 'Dot grid',
    swatch: { light: '#f7f1e3', dark: '#1e1e22' },
    tokens: chrome(
      {
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
      },
      {
        bg: '#1e1e22',
        surface: '#27272c',
        'surface-2': '#323238',
        border: '#45454d',
        text: '#ece8e1',
        muted: '#b7b0a8',
        accent: '#f29276',
        'accent-fg': '#27272c',
        danger: '#f29276',
        warning: '#e8c170',
        success: '#90d3af',
      },
    ),
  },
  {
    // Dark: Prussian-blue blueprint. Light: a whiteprint, blue lines on pale paper.
    id: 'blueprint',
    name: 'Blueprint',
    swatch: { light: '#e8eff8', dark: '#0f4c81' },
    tokens: chrome(
      {
        bg: '#e8eff8',
        surface: '#ffffff',
        'surface-2': '#e3ebf5',
        border: '#a9bfdc',
        text: '#123e75',
        muted: '#3a5c8a',
        accent: '#1d4f91',
        'accent-fg': '#ffffff',
        danger: '#b3261e',
        warning: '#875600',
        success: '#1b7438',
      },
      {
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
      },
    ),
  },
  {
    // Dark: a phosphor tube. Light: green-bar printout paper.
    id: 'crt',
    name: 'CRT',
    swatch: { light: '#eef3ea', dark: '#050a06' },
    tokens: chrome(
      {
        bg: '#eef3ea',
        surface: '#f8fbf5',
        'surface-2': '#e2eadb',
        border: '#9cc2a6',
        text: '#0f3d1e',
        muted: '#3a6447',
        accent: '#006b35',
        'accent-fg': '#ffffff',
        danger: '#b3261e',
        warning: '#875600',
        success: '#1b7438',
      },
      {
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
      },
    ),
  },
  {
    // Dark: a starry night. Light: a daytime 8-bit sky with blocky clouds.
    id: 'night-sky',
    name: 'Sky',
    swatch: { light: '#8ecbf7', dark: '#2a1a5e' },
    tokens: chrome(
      {
        bg: '#8ecbf7',
        surface: '#ffffff',
        'surface-2': '#eaf4ff',
        border: '#8fb4e0',
        text: '#17224d',
        muted: '#435180',
        accent: '#b8135a',
        'accent-fg': '#ffffff',
        danger: '#b3261e',
        warning: '#7f5200',
        success: '#17703a',
      },
      {
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
      },
    ),
  },
  {
    // Light: newsprint in a black frame. Dark: a black poster in a red frame.
    id: 'poster',
    name: 'Poster',
    swatch: { light: '#f2efe8', dark: '#111111' },
    tokens: chrome(
      {
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
      },
      {
        bg: '#111111',
        surface: '#161616',
        'surface-2': '#2a2a2a',
        border: '#f2efe8',
        text: '#f2efe8',
        muted: '#b5afa4',
        accent: '#ff3b45',
        'accent-fg': '#141414',
        danger: '#ff4d57',
        warning: '#ffd23f',
        success: '#7cdc9a',
      },
    ),
  },
];
export const BACKGROUND_IDS = BACKGROUNDS.map((b) => b.id);
export const DEFAULT_BACKGROUND = 'plain';

export function getBackground(id: string | undefined): Background {
  return BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0];
}
