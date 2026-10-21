import '@fontsource/press-start-2p/400.css';
import '@fontsource/vt323/400.css';
import { modeTokens, tokens } from '../palette';
import type { Paper, Skin } from './types';
import './pixel.css';

// Dark: deep 8-bit panels with white borders, for a night sky. Light: bright pastel panels with
// dark outlines, like a daytime level.
const panel = (
  id: string,
  name: string,
  light: [bg: string, shade: string, ink: string, sub: string],
  dark: Record<string, string>,
  extra: { light?: Record<string, string> } = {},
): Paper => ({
  id,
  name,
  swatch: { light: light[0], dark: dark.bg ?? '#3b2380' },
  tokens: {
    light: tokens({
      bg: light[0],
      surface: light[0],
      'surface-2': light[1],
      border: light[2],
      text: light[2],
      muted: light[3],
      ...extra.light,
    }),
    dark: tokens(dark),
  },
});

export const pixel: Skin = {
  id: 'pixel',
  name: 'Pixel',
  description: '8-bit arcade panels with chunky borders.',
  tokens: modeTokens(
    {
      bg: '#f1e9ff',
      surface: '#f1e9ff',
      'surface-2': '#ddd0ff',
      border: '#24124f',
      text: '#24124f',
      muted: '#4b3a80',
      accent: '#b8135a',
      'accent-fg': '#ffffff',
      danger: '#b3261e',
      warning: '#7f5200',
      success: '#17703a',
    },
    {
      bg: '#3b2380',
      surface: '#3b2380',
      'surface-2': '#523a9c',
      border: '#f4f1ff',
      text: '#f4f1ff',
      muted: '#cdc4ff',
      accent: '#ffd23f',
      'accent-fg': '#1b1238',
      danger: '#ff8080',
      warning: '#ffd23f',
      success: '#7cf2a8',
    },
  ),
  papers: [
    panel('grape', 'Grape', ['#f1e9ff', '#ddd0ff', '#24124f', '#4b3a80'], {}),
    panel(
      'forest',
      'Forest',
      ['#dcf5e0', '#c0eac8', '#10331c', '#2c5a3a'],
      { bg: '#1f5130', surface: '#1f5130', 'surface-2': '#2e6b42', muted: '#c8f0d4' },
      { light: { accent: '#a3105a' } },
    ),
    panel('ocean', 'Ocean', ['#dbeeff', '#c0dffa', '#0f254d', '#2b4c84'], {
      bg: '#1c3f7a',
      surface: '#1c3f7a',
      'surface-2': '#2b5597',
      muted: '#cfe0ff',
    }),
    panel(
      'lava',
      'Lava',
      ['#ffe1e7', '#ffc9d4', '#4a0f22', '#76283f'],
      {
        bg: '#7a1f3d',
        surface: '#7a1f3d',
        'surface-2': '#952d50',
        muted: '#ffd0de',
        danger: '#ffd23f',
      },
      { light: { accent: '#9a1150', danger: '#a3001e' } },
    ),
  ],
  font: 'VT323, ui-monospace, monospace',
  headingFont: '"Press Start 2P", VT323, monospace',
  displayFont: '"Press Start 2P", VT323, monospace',
  glyphWidth: 1.05,
  scale: 1.3,
  radius: '0px',
  headerIcon: true,
  swatch: { light: '#f1e9ff', dark: '#3b2380' },
};
