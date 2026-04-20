/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0e0d15',
          800: '#111119',
          700: '#19182494',
          600: '#1e1c2a',
          500: '#252337',
          400: '#312e46',
        },
        parchment: {
          DEFAULT: '#f0ebe0',
          dim: '#b8b0a0',
          muted: '#7a7265',
          deep: '#4a4238',
        },
        gold: {
          DEFAULT: '#c9a96e',
          bright: '#e0c48a',
          dim: '#9a7a4f',
          faint: 'rgba(201, 169, 110, 0.12)',
          border: 'rgba(201, 169, 110, 0.25)',
          borderHover: 'rgba(201, 169, 110, 0.65)',
        },
        slate: {
          DEFAULT: '#3a5f82',
          light: '#5080a8',
          faint: 'rgba(58, 95, 130, 0.15)',
          border: 'rgba(58, 95, 130, 0.4)',
        },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'story': ['1.125rem', { lineHeight: '1.9', letterSpacing: '0.01em' }],
      },
    },
  },
  plugins: [],
}
