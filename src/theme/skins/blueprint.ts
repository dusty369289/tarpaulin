import '@fontsource/architects-daughter/400.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import { modeTokens } from '../palette';
import type { Skin } from './types';
import './blueprint.css';

// Dark: a classic blueprint, white lines on Prussian blue with yellow pencil. Light: a
// whiteprint, blue lines on white paper with red-pencil markup.
export const blueprint: Skin = {
  id: 'blueprint',
  name: 'Blueprint',
  description: 'Technical drawing: lettered panels, fine lines, pencil notes.',
  tokens: modeTokens(
    {
      bg: '#f6f8fb',
      surface: '#f6f8fb',
      'surface-2': '#e3ebf5',
      border: '#1d4f91',
      text: '#123e75',
      muted: '#3a5c8a',
      accent: '#b0392c',
      'accent-fg': '#ffffff',
      danger: '#b3261e',
      warning: '#875600',
      success: '#1b7438',
    },
    {
      bg: '#0f4c81',
      surface: '#0f4c81',
      'surface-2': '#1a5c96',
      border: '#eaf4ff',
      text: '#eaf4ff',
      muted: '#b4d4f3',
      accent: '#ffe08a',
      'accent-fg': '#0f4c81',
      danger: '#ffb3a6',
      warning: '#ffe08a',
      success: '#a8f0c6',
    },
  ),
  font: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  headingFont: '"IBM Plex Mono", ui-monospace, monospace',
  displayFont: '"IBM Plex Mono", ui-monospace, monospace',
  glyphWidth: 0.62,
  scale: 0.95,
  radius: '0px',
  headerIcon: true,
  swatch: {
    light: '#f6f8fb linear-gradient(rgba(29,79,145,.3) 1px, transparent 1px) 0 0 / 8px 8px',
    dark: '#0f4c81 linear-gradient(rgba(255,255,255,.25) 1px, transparent 1px) 0 0 / 8px 8px',
  },
};
