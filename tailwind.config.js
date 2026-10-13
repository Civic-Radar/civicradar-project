/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
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
        accent: {
          DEFAULT: token('accent'),
          soft: token('accent-soft'),
          strong: token('accent-strong'),
          vivid: token('accent-vivid'),
          line: token('accent-line'),
          wash: token('accent-wash'),
        },
        sidebar: {
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
