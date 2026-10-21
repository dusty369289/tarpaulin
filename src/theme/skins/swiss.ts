import '@fontsource/archivo-black/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/800.css';
import { modeTokens } from '../palette';
import type { Skin } from './types';
import './swiss.css';

// Light: black type and rules on newsprint. Dark: a black poster with off-white type and rules,
// same red.
const CREAM = {
  bg: '#f2efe8',
  surface: '#f2efe8',
  'surface-2': '#e3dfd5',
  border: '#111111',
  text: '#111111',
  muted: '#57524a',
  accent: '#d10511',
  'accent-fg': '#ffffff',
  danger: '#d10511',
  warning: '#7a4d00',
  success: '#1d6b34',
};
const BLACK = {
  bg: '#141414',
  surface: '#141414',
  'surface-2': '#2a2a2a',
  border: '#f2efe8',
  text: '#f2efe8',
  muted: '#b5afa4',
  accent: '#ff3b45',
  'accent-fg': '#141414',
  danger: '#ff4d57',
  warning: '#ffd23f',
  success: '#7cdc9a',
};

export const swiss: Skin = {
  id: 'swiss',
  name: 'Swiss',
  description: 'Poster grid: heavy rules, big type, one red.',
  tokens: modeTokens(CREAM, BLACK),
  papers: [
    {
      id: 'paper',
      name: 'Paper',
      swatch: { light: '#f2efe8', dark: '#141414' },
      tokens: { light: {}, dark: {} },
    },
    {
      id: 'red',
      name: 'Red',
      swatch: { light: '#e30613', dark: '#c0040f' },
      tokens: modeTokens(
        {
          bg: '#d10511',
          surface: '#d10511',
          'surface-2': '#b0040e',
          text: '#ffffff',
          muted: '#ffe1e1',
          accent: '#ffffff',
          'accent-fg': '#d10511',
          danger: '#ffffff',
          warning: '#ffe08a',
          success: '#ffffff',
        },
        {
          bg: '#c0040f',
          surface: '#c0040f',
          'surface-2': '#9e030c',
          border: '#f2efe8',
          text: '#ffffff',
          muted: '#ffe1e1',
          accent: '#ffffff',
          'accent-fg': '#c0040f',
          danger: '#ffffff',
          warning: '#ffe08a',
          success: '#ffffff',
        },
      ),
    },
    {
      // Stored as 'black' (its original name); it is the opposite of the mode's paper.
      id: 'black',
      name: 'Inverted',
      swatch: { light: '#111111', dark: '#f2efe8' },
      tokens: modeTokens({ ...BLACK, bg: '#111111', surface: '#111111', border: '#111111' }, CREAM),
    },
  ],
  font: 'Inter, "Helvetica Neue", Arial, sans-serif',
  headingFont: 'Inter, "Helvetica Neue", Arial, sans-serif',
  displayFont: '"Archivo Black", Inter, "Arial Black", sans-serif',
  glyphWidth: 0.78,
  radius: '0px',
  headerIcon: false,
  swatch: {
    light: 'linear-gradient(90deg, #e30613 0 34%, #f2efe8 34%)',
    dark: 'linear-gradient(90deg, #e30613 0 34%, #141414 34%)',
  },
};
