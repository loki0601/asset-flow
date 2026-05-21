import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Each brand-* token is an `rgb(triplet / <alpha>)` reference to a
        // CSS variable defined in globals.css.  Light is the default
        // (:root); dark is `html[data-theme="dark"]`.  Same Tailwind class
        // name, theme swaps under it.
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          mid: 'rgb(var(--brand-mid) / <alpha-value>)',
          sage: 'rgb(var(--brand-sage) / <alpha-value>)',
          ink: 'rgb(var(--brand-ink) / <alpha-value>)',
          surface: 'rgb(var(--brand-surface) / <alpha-value>)',
          line: 'rgb(var(--brand-line) / <alpha-value>)',
          warm: 'rgb(var(--brand-warm) / <alpha-value>)',
          // Korean stock-app direction convention (red=up, blue=down).
          up: 'rgb(var(--brand-up) / <alpha-value>)',
          down: 'rgb(var(--brand-down) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
