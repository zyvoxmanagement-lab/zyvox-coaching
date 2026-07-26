/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)',
        },
        emerald: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        navy: {
          800: '#0f172a',
          900: '#0a0f1e',
          950: '#060912',
        },
      },
      fontFamily: {
        sans: ['"Inter"', '"Hiragino Kaku Gothic ProN"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
