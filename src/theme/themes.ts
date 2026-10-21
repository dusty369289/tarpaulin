export type ThemeName = 'light' | 'dark' | 'high-contrast';
export type ThemeChoice = ThemeName | 'system';

export interface ThemeTokens {
  bg: string;
  surface: string;
  'surface-2': string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  'accent-fg': string;
  danger: string;
  warning: string;
  success: string;
}

// Values are "r g b" so Tailwind can apply opacity (`bg-surface/80`).
export const THEMES: Record<ThemeName, ThemeTokens> = {
  light: {
    bg: '244 245 247',
    surface: '255 255 255',
    'surface-2': '241 243 246',
    border: '226 229 235',
    text: '17 24 39',
    muted: '100 108 122',
    accent: '79 70 229',
    'accent-fg': '255 255 255',
    danger: '220 38 38',
    warning: '180 110 0',
    success: '22 140 80',
  },
  dark: {
    bg: '15 17 23',
    surface: '24 27 35',
    'surface-2': '33 37 48',
    border: '46 51 64',
    text: '232 234 240',
    muted: '150 157 172',
    accent: '129 140 248',
    'accent-fg': '17 24 39',
    danger: '248 113 113',
    warning: '251 191 36',
    success: '74 222 128',
  },
  'high-contrast': {
    bg: '0 0 0',
    surface: '0 0 0',
    'surface-2': '28 28 28',
    border: '255 255 255',
    text: '255 255 255',
    muted: '220 220 220',
    accent: '255 214 0',
    'accent-fg': '0 0 0',
    danger: '255 110 110',
    warning: '255 214 0',
    success: '90 255 140',
  },
};

export const FONTS = {
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace',
  readable: 'Verdana, Tahoma, "Atkinson Hyperlegible", system-ui, sans-serif',
} as const;
export type FontName = keyof typeof FONTS;
