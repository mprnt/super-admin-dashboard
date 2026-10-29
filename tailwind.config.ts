import type { Config } from 'tailwindcss';

/**
 * Colour names map to the CSS variables in app/globals.css, so one stylesheet
 * decides both themes. `side*` colour the navigation rail; `accent` is the mint used
 * for the active marker and live signals. `brand` is the fill (buttons, the active tab); `brand-text`
 * is the same green where it is read as text on the page, and it is lighter in
 * dark mode so it stays legible.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        mute: 'rgb(var(--c-mute) / <alpha-value>)',
        brand: 'rgb(var(--c-brand) / <alpha-value>)',
        'brand-text': 'rgb(var(--c-brand-text) / <alpha-value>)',
        'brand-ink': 'rgb(var(--c-brand-ink) / <alpha-value>)',
        'brand-soft': 'rgb(var(--c-brand-soft) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        side: 'rgb(var(--c-side) / <alpha-value>)',
        'side-ink': 'rgb(var(--c-side-ink) / <alpha-value>)',
        'side-mute': 'rgb(var(--c-side-mute) / <alpha-value>)',
        ok: 'rgb(var(--c-ok) / <alpha-value>)',
        warn: 'rgb(var(--c-warn) / <alpha-value>)',
        bad: 'rgb(var(--c-bad) / <alpha-value>)',
        info: 'rgb(var(--c-info) / <alpha-value>)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        sheet: 'var(--shadow-sheet)',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
