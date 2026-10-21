import type { Skin } from './types';

// The original look: a plain card in the app theme's colours. Everything inherits, so it follows
// light, dark and high contrast through the theme itself.
export const card: Skin = {
  id: 'card',
  name: 'Card',
  description: 'Clean cards in your theme colours.',
  headerIcon: true,
  swatch: { light: '#ffffff', dark: '#181b23' },
};
