import '@fontsource/caveat/700.css';
import '@fontsource/patrick-hand/400.css';
import { modeTokens } from '../palette';
import type { Skin } from './types';
import './index-card.css';

// Light: a white ruled card in biro. Dark: a charcoal card with pale rules, in white pen.
export const indexCard: Skin = {
  id: 'index-card',
  name: 'Index card',
  description: 'Ruled cards with a red margin, written in pen.',
  tokens: modeTokens(
    {
      bg: '#fdfcf6',
      surface: '#fdfcf6',
      'surface-2': '#f1ede0',
      border: '#d8d2c0',
      text: '#2b2118',
      muted: '#5f5244',
      accent: '#a3231b',
      'accent-fg': '#ffffff',
      danger: '#a3231b',
      warning: '#7a4d00',
      success: '#1d6b34',
    },
    {
      bg: '#2b2c30',
      surface: '#2b2c30',
      'surface-2': '#36383d',
      border: '#4b4d54',
      text: '#eeede8',
      muted: '#bdb9b0',
      accent: '#ff958a',
      'accent-fg': '#2a1a12',
      danger: '#ff958a',
      warning: '#f2c46b',
      success: '#94d9a5',
    },
  ),
  font: '"Patrick Hand", "Comic Sans MS", system-ui, sans-serif',
  headingFont: 'Caveat, "Patrick Hand", cursive',
  displayFont: 'Caveat, "Patrick Hand", cursive',
  glyphWidth: 0.5,
  scale: 1.1,
  radius: '1px',
  tilt: 1.5,
  decor: ['tape', 'none'],
  headerIcon: false,
  swatch: {
    light: 'repeating-linear-gradient(#fdfcf6 0 9px, #a9c7e8 9px 10px)',
    dark: 'repeating-linear-gradient(#2b2c30 0 9px, #4f6a88 9px 10px)',
  },
};
