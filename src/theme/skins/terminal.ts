import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/vt323/400.css';
import { modeTokens } from '../palette';
import type { Skin } from './types';
import './terminal.css';

// Dark: glowing phosphor on a black tube. Light: a paper-white teletype printout, the phosphor
// colour turned into ink (green bar, amber on cream, blue on white).
export const terminal: Skin = {
  id: 'terminal',
  name: 'Terminal',
  description: 'Phosphor on black, or ink on a printout; box-drawn and monospaced.',
  tokens: modeTokens(
    {
      bg: '#f4f8ef',
      surface: '#f4f8ef',
      'surface-2': '#e0ead6',
      border: '#2f7a45',
      text: '#0f4a23',
      muted: '#2f6a3f',
      accent: '#006b35',
      'accent-fg': '#ffffff',
      danger: '#b3261e',
      warning: '#875600',
      success: '#1b7438',
    },
    {
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
    },
  ),
  papers: [
    {
      id: 'green',
      name: 'Green',
      swatch: { light: '#1b7438', dark: '#49ff7d' },
      tokens: { light: {}, dark: {} },
    },
    {
      id: 'amber',
      name: 'Amber',
      swatch: { light: '#9a4d00', dark: '#ffb000' },
      tokens: modeTokens(
        {
          bg: '#fbf3df',
          surface: '#fbf3df',
          'surface-2': '#f0e1bb',
          border: '#a8731a',
          text: '#5e3600',
          muted: '#7f4f00',
          accent: '#9a4500',
          'accent-fg': '#ffffff',
          success: '#4a6800',
        },
        {
          bg: '#0a0700',
          surface: '#0a0700',
          'surface-2': '#241800',
          text: '#ffb000',
          muted: '#c98a00',
          border: '#c98a00',
          accent: '#ffe0a0',
          'accent-fg': '#0a0700',
          success: '#ffd060',
        },
      ),
    },
    {
      id: 'ice',
      name: 'Ice',
      swatch: { light: '#005f87', dark: '#7fdbff' },
      tokens: modeTokens(
        {
          bg: '#eef6fa',
          surface: '#eef6fa',
          'surface-2': '#d6e8f1',
          border: '#3f86a8',
          text: '#0b405a',
          muted: '#25617e',
          accent: '#005a80',
          'accent-fg': '#ffffff',
          success: '#16704e',
        },
        {
          bg: '#02080c',
          surface: '#02080c',
          'surface-2': '#0a1e2a',
          text: '#7fdbff',
          muted: '#4aa8cf',
          border: '#4aa8cf',
          accent: '#d2f3ff',
          'accent-fg': '#02080c',
          success: '#7fffbf',
        },
      ),
    },
  ],
  font: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  headingFont: 'VT323, "IBM Plex Mono", monospace',
  displayFont: 'VT323, "IBM Plex Mono", monospace',
  glyphWidth: 0.62,
  scale: 0.95,
  radius: '0px',
  headerIcon: false,
  swatch: {
    light: 'repeating-linear-gradient(#f4f8ef 0 6px, #dcebd2 6px 12px)',
    dark: '#050a06',
  },
};
