import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/vt323/400.css';
import { tokens } from '../palette';
import type { Skin } from './types';
import './terminal.css';

export const terminal: Skin = {
  id: 'terminal',
  name: 'Terminal',
  description: 'Green phosphor on black, box-drawn and glowing.',
  tokens: tokens({
    bg: '#050a06',
    surface: '#050a06',
    'surface-2': '#0c2013',
    border: '#2fbf5a',
    text: '#49ff7d',
    muted: '#2fbf5a',
    accent: '#b6ffcb',
    'accent-fg': '#050a06',
    danger: '#ff5c5c',
    warning: '#ffd23f',
    success: '#49ff7d',
  }),
  papers: [
    {
      id: 'green',
      name: 'Green',
      swatch: '#49ff7d',
      tokens: tokens({ text: '#49ff7d', muted: '#2fbf5a', border: '#2fbf5a', accent: '#b6ffcb' }),
    },
    {
      id: 'amber',
      name: 'Amber',
      swatch: '#ffb000',
      tokens: tokens({
        bg: '#0a0700',
        surface: '#0a0700',
        'surface-2': '#241800',
        text: '#ffb000',
        muted: '#c98a00',
        border: '#c98a00',
        accent: '#ffe0a0',
        'accent-fg': '#0a0700',
        success: '#ffd060',
      }),
    },
    {
      id: 'ice',
      name: 'Ice',
      swatch: '#7fdbff',
      tokens: tokens({
        bg: '#02080c',
        surface: '#02080c',
        'surface-2': '#0a1e2a',
        text: '#7fdbff',
        muted: '#4aa8cf',
        border: '#4aa8cf',
        accent: '#d2f3ff',
        'accent-fg': '#02080c',
        success: '#7fffbf',
      }),
    },
  ],
  font: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  headingFont: 'VT323, "IBM Plex Mono", monospace',
  displayFont: 'VT323, "IBM Plex Mono", monospace',
  glyphWidth: 0.62,
  scale: 0.95,
  radius: '0px',
  headerIcon: false,
  swatch: '#050a06',
};
