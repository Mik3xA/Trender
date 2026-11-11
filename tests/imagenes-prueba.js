const sharp = require('sharp');

/** Fotos de catálogo sintéticas (SVG -> PNG/JPEG) para probar sin internet. */
const FORMAS = {
  camiseta: '<polygon points="230,140 370,140 520,230 470,300 430,270 430,560 170,560 170,270 130,300 80,230" fill="#b3282d"/>',
  pantalon: '<polygon points="190,90 410,90 430,560 330,560 300,250 270,560 170,560" fill="#2f4f86"/>',
  tenis: '<path d="M60,330 L120,250 L300,240 L420,300 L560,330 L560,380 L60,380 Z" fill="#f1f1f1" stroke="#222" stroke-width="6"/><rect x="60" y="370" width="500" height="22" fill="#222"/>',
  vestido: '<polygon points="250,40 350,40 360,200 470,580 130,580 240,200" fill="#5c1f2c"/>',
};

async function fotoCatalogo(forma, { fondo = '#ffffff', ancho = 600, alto = 600, formato = 'jpeg' } = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}"><rect width="100%" height="100%" fill="${fondo}"/>${FORMAS[forma]}</svg>`;
  return sharp(Buffer.from(svg))[formato]().toBuffer();
}

/** Foto "con modelo": piel visible y fondo de calle con ruido (no apta para recortar). */
async function fotoConModelo() {
  const colores = ['#3a5a40', '#a3b18a', '#dad7cd', '#b5651d', '#264653'];
  const franjas = Array.from({ length: 15 * 15 }, (_, k) => {
    const [i, j] = [k % 15, Math.floor(k / 15)];
    return `<rect x="${i * 40}" y="${j * 40}" width="40" height="40" fill="${colores[(i + j * 2) % 5]}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
    ${franjas}
    <ellipse cx="300" cy="150" rx="90" ry="110" fill="#d9a07a"/>
    <rect x="180" y="250" width="240" height="330" fill="#c98f6b"/>
    <rect x="200" y="300" width="200" height="200" fill="#b3282d"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

/** Banner apaisado con texto. */
async function banner() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300"><rect width="100%" height="100%" fill="#111"/>
    <text x="40" y="180" font-size="120" fill="#fff">SALE -50%</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

module.exports = { fotoCatalogo, fotoConModelo, banner };
