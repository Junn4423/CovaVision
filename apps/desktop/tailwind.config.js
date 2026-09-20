/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#0E4F9A',
          secondary: '#33B1FF',
          accent: '#F9A826',
          dark: '#0D1B2A',
        },
        primary: {
          50: '#edf5fd',
          100: '#d6e8fb',
          200: '#b2d5f8',
          300: '#7ebbf4',
          400: '#33b1ff',
          500: '#156fe0',
          600: '#0e4f9a',
          700: '#0b3e7a',
          800: '#093364',
          900: '#0a2544',
          950: '#06162a',
        },
      },
    },
  },
  plugins: [],
}
