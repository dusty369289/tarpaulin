import '@fontsource/caveat/700.css';
import '@fontsource/patrick-hand/400.css';
import { modeTokens, tokens } from '../palette';
import type { Paper, Skin } from './types';
import './postit.css';

// Light: bright notes in dark pencil. Dark: the same notes after hours, deeper and a little
// desaturated, written in pale chalky ink.
type Shade = [bg: string, shade: string, edge: string];
const paper = (id: string, name: string, light: Shade, dark: Shade): Paper => ({
  id,
  name,
  swatch: { light: light[0], dark: dark[0] },
  tokens: {
    light: tokens({ bg: light[0], surface: light[0], 'surface-2': light[1], border: light[2] }),
    dark: tokens({ bg: dark[0], surface: dark[0], 'surface-2': dark[1], border: dark[2] }),
  },
});

export const postit: Skin = {
  id: 'postit',
  name: 'Post-it',
  description: 'Sticky notes, pinned and taped at a slight angle.',
  tokens: modeTokens(
    {
      text: '#2b2118',
      muted: '#5a4a38',
      accent: '#a3231b',
      'accent-fg': '#ffffff',
      danger: '#a3231b',
      warning: '#7a4d00',
      success: '#1d6b34',
    },
    {
      text: '#f7f0dd',
      muted: '#d9cdb2',
      accent: '#ffa08f',
      'accent-fg': '#2a1a12',
      danger: '#ffa08f',
      warning: '#ffd27a',
      success: '#a3e6ae',
    },
  ),
  papers: [
    paper('yellow', 'Yellow', ['#fff27a', '#f3e15c', '#d9c443'], ['#574918', '#645520', '#7c6c34']),
    paper('pink', 'Pink', ['#ffc4d6', '#f7adc4', '#e491aa'], ['#56293a', '#643346', '#7d475b']),
    paper('blue', 'Blue', ['#bfe6ff', '#a6d9fa', '#86c2ea'], ['#1f3c56', '#294a66', '#3a6283']),
    paper('green', 'Green', ['#c9f2b8', '#b3e69f', '#93cf7c'], ['#28462b', '#325535', '#466f4b']),
    paper('orange', 'Orange', ['#ffd5a3', '#f9c287', '#e7a865'], ['#583820', '#674528', '#805a37']),
    paper('lilac', 'Lilac', ['#e3d5ff', '#d2bffa', '#b9a1ea'], ['#3d3160', '#4a3d70', '#5f528a']),
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
  swatch: { light: '#fff27a', dark: '#574918' },
};
