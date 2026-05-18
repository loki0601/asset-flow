import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#2D4F35',
          mid: '#4A7256',
          sage: '#7A8C7E',
          ink: '#2D3A30',
          surface: '#F4F7F5',
          line: '#E9EDE9',
          warm: '#FDFBF7',
          // Korean stock-app direction convention (red=up, blue=down).
          // Toned down to harmonize with the earthy sage palette — no pure
          // saturated reds/blues.
          up: '#B85950',
          down: '#4F6B82',
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
