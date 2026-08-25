/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: '#0a0f1c',
        panel: '#111827',
        line: '#1f2937',
        amber: { DEFAULT: '#f59e0b', dim: 'rgba(245,158,11,0.12)' },
        cyan: { DEFAULT: '#06b6d4', dim: 'rgba(6,182,214,0.12)' },
        muted: '#94a3b8',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Fragment Mono"', 'ui-monospace', 'monospace'],
      },
      maxWidth: { prose: '72ch' },
    },
  },
  plugins: [],
};
