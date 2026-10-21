import '@fontsource/archivo-black/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/800.css';
import { tokens } from '../palette';
import type { Skin } from './types';
import './swiss.css';

export const swiss: Skin = {
  id: 'swiss',
  name: 'Swiss',
  description: 'Poster grid: heavy rules, black type, one red.',
  tokens: tokens({
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
  }),
  papers: [
    { id: 'paper', name: 'Paper', swatch: '#f2efe8', tokens: {} },
    {
      id: 'red',
      name: 'Red',
      swatch: '#e30613',
      tokens: tokens({
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
      }),
    },
    {
      id: 'black',
      name: 'Black',
      swatch: '#111111',
      tokens: tokens({
        bg: '#111111',
        surface: '#111111',
        'surface-2': '#2a2a2a',
        text: '#f2efe8',
        muted: '#b5afa4',
        accent: '#ff4d57',
        'accent-fg': '#111111',
        danger: '#ff4d57',
        warning: '#ffd23f',
        success: '#7cdc9a',
      }),
    },
  ],
  font: 'Inter, "Helvetica Neue", Arial, sans-serif',
  headingFont: 'Inter, "Helvetica Neue", Arial, sans-serif',
  displayFont: '"Archivo Black", Inter, "Arial Black", sans-serif',
  glyphWidth: 0.78,
  radius: '0px',
  headerIcon: false,
  swatch: 'linear-gradient(90deg, #e30613 0 34%, #f2efe8 34%)',
};
