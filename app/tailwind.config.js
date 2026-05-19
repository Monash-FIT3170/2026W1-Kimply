/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./imports/**/*.{js,jsx}', './client/**/*.{js,jsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: 'oklch(0.14 0.02 270)',
        surface: 'oklch(0.20 0.02 270)',
        surface2: 'oklch(0.24 0.02 270)',
        hairline: 'oklch(0.32 0.02 270)',
        fg: 'oklch(0.97 0.006 80)',
        fg2: 'oklch(0.72 0.01 270)',
        fg3: 'oklch(0.55 0.015 270)',
        primary: 'oklch(0.86 0.19 130)',
        tile: {
          pink: 'oklch(0.72 0.19 12)',
          amber: 'oklch(0.83 0.16 80)',
          teal: 'oklch(0.78 0.13 195)',
          violet: 'oklch(0.66 0.19 295)',
        },
      },
      fontFamily: {
        outfit: ['Outfit', 'system-ui', 'sans-serif'],
        manrope: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'kimply-pulse': 'kimplyPulse 1.4s ease-in-out infinite',
        'kimply-caret': 'kimplyCaret 1s steps(2) infinite',
      },
      borderRadius: {
        xl2: '14px',
        xl3: '18px',
        xl4: '22px',
      },
    },
  },
  plugins: [],
};
