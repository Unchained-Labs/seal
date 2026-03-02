/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        rust: {
          bg: '#161114',
          panel: '#231a20',
          panelSoft: '#2d2128',
          border: '#5a4150',
          text: '#f3e9ef',
          muted: '#c9b3bf',
          accent: '#be5d3a',
          accentSoft: '#e7a189',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(190,93,58,0.25), 0 14px 34px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
}
