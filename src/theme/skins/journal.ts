import '@fontsource/fraunces/600.css';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import { modeTokens } from '../palette';
import type { Skin } from './types';
import './journal.css';

// Light: black ink on cream paper. Dark: a charcoal notebook in pale gel pen, with muted washi.
export const journal: Skin = {
  id: 'journal',
  name: 'Journal',
  description: 'Bullet-journal boxes in ink, with washi tape.',
  tokens: modeTokens(
    {
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
    },
    {
      bg: '#27272c',
      surface: '#27272c',
      'surface-2': '#323238',
      border: '#d8d3ca',
      text: '#ece8e1',
      muted: '#b7b0a8',
      accent: '#f29276',
      'accent-fg': '#27272c',
      danger: '#f29276',
      warning: '#e8c170',
      success: '#90d3af',
    },
  ),
  font: 'Kalam, "Segoe Print", "Comic Sans MS", cursive',
  headingFont: 'Fraunces, Georgia, serif',
  displayFont: 'Fraunces, Georgia, serif',
  glyphWidth: 0.66,
  radius: 'var(--wobble)',
  decor: ['washi-coral', 'washi-mint', 'none'],
  headerIcon: false,
  swatch: { light: '#fffdf7', dark: '#27272c' },
};
