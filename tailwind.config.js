/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/**/*.{ts,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        'slate-base':  '#1E2328',
        'slate-mid':   '#2A3038',
        'slate-light': '#3A424D',
        'fog':         '#8B95A5',
        'snow':        '#E8ECF1',
        'amber-sos':   '#E5A83B',
        'steady-green':'#4A9B6E',
        'relay-blue':  '#5B8DB8',
        'caution-red': '#C45B5B',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
