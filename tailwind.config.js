/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // The font variable is set by next/font in app/layout.tsx.
      fontFamily: {
        display: ['var(--font-dm-serif-display)', 'Georgia', '"Times New Roman"', 'serif'],
      },
      // Theme colors; the values live as CSS variables in app/globals.css.
      colors: {
        surface: token('surface'),
        card: token('card'),
        raised: token('raised'),
        line: {
          DEFAULT: token('line'),
          strong: token('line-strong'),
        },
        fg: {
          DEFAULT: token('fg'),
          soft: token('fg-soft'),
          muted: token('fg-muted'),
          subtle: token('fg-subtle'),
          faint: token('fg-faint'),
        },
        backdrop: token('backdrop'),
        'on-dark': token('on-dark'),
        accent: {
          DEFAULT: token('accent'),
          soft: token('accent-soft'),
          strong: token('accent-strong'),
          vivid: token('accent-vivid'),
          line: token('accent-line'),
          wash: token('accent-wash'),
        },
        sidebar: {
          DEFAULT: token('sidebar'),
          muted: token('sidebar-muted'),
          icon: token('sidebar-icon'),
          active: token('sidebar-active'),
        },
        danger: {
          DEFAULT: token('danger'),
          soft: token('danger-soft'),
          vivid: token('danger-vivid'),
          line: token('danger-line'),
          wash: token('danger-wash'),
        },
        warning: {
          DEFAULT: token('warning'),
          soft: token('warning-soft'),
          vivid: token('warning-vivid'),
        },
        info: {
          soft: token('info-soft'),
          vivid: token('info-vivid'),
        },
      },
    },
  },
  plugins: [],
};
