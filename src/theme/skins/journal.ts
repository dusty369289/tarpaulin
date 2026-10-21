import '@fontsource/fraunces/600.css';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import { tokens } from '../palette';
import type { Skin } from './types';
import './journal.css';

export const journal: Skin = {
  id: 'journal',
  name: 'Journal',
  description: 'Bullet-journal boxes in ink, with washi tape.',
  tokens: tokens({
    bg: '#fffdf7',
    surface: '#fffdf7',
    'surface-2': '#f3ecdc',
    border: '#2d2a32',
    text: '#2d2a32',
    muted: '#615a66',
    accent: '#b23f27',
    'accent-fg': '#ffffff',
    danger: '#b23f27',
    warning: '#7a5300',
    success: '#2f6b4c',
  }),
  font: 'Kalam, "Segoe Print", "Comic Sans MS", cursive',
  headingFont: 'Fraunces, Georgia, serif',
  displayFont: 'Fraunces, Georgia, serif',
  glyphWidth: 0.66,
  radius: 'var(--wobble)',
  decor: ['washi-coral', 'washi-mint', 'none'],
  headerIcon: false,
  swatch: '#fffdf7',
};
