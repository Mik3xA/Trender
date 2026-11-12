/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        // Paleta de Trender: blanco (fondos), negro (texto y acciones), verde oliva (acento).
        tinta: { DEFAULT: '#141414', 2: '#55534d', 3: '#8b8981' },
        papel: '#ffffff',
        hueso: { DEFAULT: '#f6f5f0', 2: '#ecebe4' },
        linea: '#e4e2da',
        oliva: { DEFAULT: '#5f6b38', claro: '#7a8650', tenue: '#eef0e3', oscuro: '#47512a' },
      },
      fontFamily: {
        sans: ['Inter', 'Helvetica Neue', 'Arial', 'system-ui', 'sans-serif'],
      },
      maxWidth: { pagina: '1240px' },
    },
  },
  plugins: [],
};
