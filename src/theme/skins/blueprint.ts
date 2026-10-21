import '@fontsource/architects-daughter/400.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import { tokens } from '../palette';
import type { Skin } from './types';
import './blueprint.css';

export const blueprint: Skin = {
  id: 'blueprint',
  name: 'Blueprint',
  description: 'Technical drawing: lettered panels, fine lines, pencil notes.',
  tokens: tokens({
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
  }),
  font: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  headingFont: '"IBM Plex Mono", ui-monospace, monospace',
  displayFont: '"IBM Plex Mono", ui-monospace, monospace',
  glyphWidth: 0.62,
  scale: 0.95,
  radius: '0px',
  headerIcon: true,
  swatch: '#0f4c81 linear-gradient(rgba(255,255,255,.25) 1px, transparent 1px) 0 0 / 8px 8px',
};
