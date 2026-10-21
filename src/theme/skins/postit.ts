import '@fontsource/caveat/700.css';
import '@fontsource/patrick-hand/400.css';
import { tokens } from '../palette';
import type { Skin } from './types';
import './postit.css';

const ink = { text: '#2b2118', muted: '#5a4a38', accent: '#a3231b', 'accent-fg': '#ffffff' };
const paper = (id: string, name: string, bg: string, shade: string, edge: string) => ({
  id,
  name,
  swatch: bg,
  tokens: tokens({ bg, surface: bg, 'surface-2': shade, border: edge }),
});

export const postit: Skin = {
  id: 'postit',
  name: 'Post-it',
  description: 'Sticky notes, pinned and taped at a slight angle.',
  tokens: tokens({
    ...ink,
    danger: '#a3231b',
    warning: '#7a4d00',
    success: '#1d6b34',
  }),
  papers: [
    paper('yellow', 'Yellow', '#fff27a', '#f3e15c', '#d9c443'),
    paper('pink', 'Pink', '#ffc4d6', '#f7adc4', '#e491aa'),
    paper('blue', 'Blue', '#bfe6ff', '#a6d9fa', '#86c2ea'),
    paper('green', 'Green', '#c9f2b8', '#b3e69f', '#93cf7c'),
    paper('orange', 'Orange', '#ffd5a3', '#f9c287', '#e7a865'),
    paper('lilac', 'Lilac', '#e3d5ff', '#d2bffa', '#b9a1ea'),
  ],
  mixPapers: true,
  font: '"Patrick Hand", "Comic Sans MS", system-ui, sans-serif',
  headingFont: 'Caveat, "Patrick Hand", cursive',
  displayFont: 'Caveat, "Patrick Hand", cursive',
  glyphWidth: 0.5,
  scale: 1.12,
  radius: '2px',
  tilt: 2.5,
  decor: ['pin-red', 'tape', 'pin-blue', 'tape-yellow'],
  headerIcon: false,
  swatch: '#fff27a',
};
