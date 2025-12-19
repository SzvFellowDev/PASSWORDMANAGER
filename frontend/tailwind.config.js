/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'manager-dark': '#0f1115',
        'manager-panel': '#181b21',
        'manager-text': '#d1d4dc',
        'neon-blue': '#2962ff',
        'neon-red': '#ff5252',
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}