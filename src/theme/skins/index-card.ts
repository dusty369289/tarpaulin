import '@fontsource/caveat/700.css';
import '@fontsource/patrick-hand/400.css';
import { tokens } from '../palette';
import type { Skin } from './types';
import './index-card.css';

export const indexCard: Skin = {
  id: 'index-card',
  name: 'Index card',
  description: 'Ruled cards with a red margin, written in pen.',
  tokens: tokens({
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
  }),
  font: '"Patrick Hand", "Comic Sans MS", system-ui, sans-serif',
  headingFont: 'Caveat, "Patrick Hand", cursive',
  displayFont: 'Caveat, "Patrick Hand", cursive',
  glyphWidth: 0.5,
  scale: 1.1,
  radius: '1px',
  tilt: 1.5,
  decor: ['tape', 'none'],
  headerIcon: false,
  swatch: 'repeating-linear-gradient(#fdfcf6 0 9px, #a9c7e8 9px 10px)',
};
