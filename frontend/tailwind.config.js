/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        // Paleta mate de Trender: negro (fondos), oliva (acento), hueso (texto y bordes de 1 px).
        negro: { DEFAULT: '#0e0e0d', 2: '#151514', 3: '#1c1c1a' },
        oliva: { DEFAULT: '#6b7041', claro: '#8a8f58', tenue: '#262819' },
        hueso: { DEFAULT: '#ece8de', 2: '#a9a59b', 3: '#6f6c65' },
        linea: 'rgba(236, 232, 222, 0.14)',
      },
      fontFamily: {
        sans: ['Inter', 'Helvetica Neue', 'Arial', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
