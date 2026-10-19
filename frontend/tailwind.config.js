/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        olive: {
          DEFAULT: '#3f4e3b',
          dark: '#323f2f',
          deep: '#2d3728'
        },
        carbon: '#18181b',
        sand: {
          DEFAULT: '#fcfcf9',
          soft: '#fafaf9'
        },
        studio: '#f4f4f2',
        taupe: '#71717a'
      }
    },
  },
  plugins: [],
}
