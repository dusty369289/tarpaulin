import type { Config } from 'tailwindcss';

// Every colour is a CSS variable set by the ThemeProvider, so themes and custom accents
// are a runtime switch rather than a rebuild.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        border: token('border'),
        text: token('text'),
        muted: token('muted'),
        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        danger: token('danger'),
        warning: token('warning'),
        success: token('success'),
      },
      borderRadius: {
        theme: 'var(--radius)',
      },
      fontFamily: {
        theme: 'var(--font)',
      },
      keyframes: {
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.96) translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'settings-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-0.25deg)' },
          '50%': { transform: 'rotate(0.25deg)' },
        },
      },
      animation: {
        'pop-in': 'pop-in 220ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both',
        'fade-in': 'fade-in 180ms ease-out both',
        'settings-in': 'settings-in 200ms ease-out both',
        'slide-in-right': 'slide-in-right 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        wiggle: 'wiggle 400ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
