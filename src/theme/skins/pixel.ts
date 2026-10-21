import '@fontsource/press-start-2p/400.css';
import '@fontsource/vt323/400.css';
import { tokens } from '../palette';
import type { Skin } from './types';
import './pixel.css';

export const pixel: Skin = {
  id: 'pixel',
  name: 'Pixel',
  description: '8-bit arcade panels with chunky borders.',
  tokens: tokens({
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
  }),
  papers: [
    { id: 'grape', name: 'Grape', swatch: '#3b2380', tokens: {} },
    {
      id: 'forest',
      name: 'Forest',
      swatch: '#1f5130',
      tokens: tokens({
        bg: '#1f5130',
        surface: '#1f5130',
        'surface-2': '#2e6b42',
        muted: '#c8f0d4',
      }),
    },
    {
      id: 'ocean',
      name: 'Ocean',
      swatch: '#1c3f7a',
      tokens: tokens({
        bg: '#1c3f7a',
        surface: '#1c3f7a',
        'surface-2': '#2b5597',
        muted: '#cfe0ff',
      }),
    },
    {
      id: 'lava',
      name: 'Lava',
      swatch: '#7a1f3d',
      tokens: tokens({
        bg: '#7a1f3d',
        surface: '#7a1f3d',
        'surface-2': '#952d50',
        muted: '#ffd0de',
        danger: '#ffd23f',
      }),
    },
  ],
  font: 'VT323, ui-monospace, monospace',
  headingFont: '"Press Start 2P", VT323, monospace',
  displayFont: '"Press Start 2P", VT323, monospace',
  glyphWidth: 1.05,
  scale: 1.3,
  radius: '0px',
  headerIcon: true,
  swatch: '#3b2380',
};
