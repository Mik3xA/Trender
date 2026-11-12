const sharp = require('sharp');

/**
 * Siluetas sintéticas de prendas (como fotos de catálogo o fotos caseras sobre
 * una superficie) para probar el análisis visual sin internet.
 */
const SILUETAS = {
  camiseta: '<path d="M240,120 Q300,160 360,120 L520,200 L470,300 L420,270 L425,560 L175,560 L180,270 L130,300 L80,200 Z" fill="#b3282d"/>',
  sudadera: '<path d="M240,110 Q300,150 360,110 L450,140 L540,520 L470,540 L420,300 L425,560 L175,560 L180,300 L130,540 L60,520 L150,140 Z" fill="#6b6b6b"/>',
  'manga-larga-junto': '<path d="M235,100 Q300,140 365,100 L440,120 L470,540 L430,540 L415,250 L410,560 L190,560 L185,250 L170,540 L130,540 L160,120 Z" fill="#20364f"/>',
  top: '<path d="M180,140 L230,140 Q300,220 370,140 L420,140 L430,260 L440,480 L160,480 L170,260 Z" fill="#3d6b7a"/>',
  pantalon: '<polygon points="190,40 410,40 430,570 330,570 300,230 270,570 170,570" fill="#2f4f86"/>',
  short: '<polygon points="160,150 440,150 470,430 320,440 300,300 280,440 130,430" fill="#7b5c3a"/>',
  falda: '<polygon points="220,120 380,120 480,500 120,500" fill="#5b6236"/>',
  vestido: '<path d="M250,30 L275,30 Q300,80 325,30 L350,30 L360,200 Q330,240 345,280 L470,580 L130,580 L255,280 Q270,240 240,200 Z" fill="#5c1f2c"/>',
  tenis: '<path d="M60,330 L120,250 L300,240 L420,300 L560,330 L560,380 L60,380 Z" fill="#f1f1f1" stroke="#222" stroke-width="6"/><rect x="60" y="370" width="500" height="22" fill="#222"/>',
  bota: '<path d="M220,80 L340,80 L345,380 L470,430 L480,520 L200,520 L205,300 Z" fill="#3d2a1e"/><rect x="200" y="505" width="282" height="20" fill="#111"/>',
  'par-tenis': '<ellipse cx="220" cy="300" rx="75" ry="190" fill="#e6e6e6" stroke="#333" stroke-width="5"/><ellipse cx="390" cy="300" rx="75" ry="190" fill="#e6e6e6" stroke="#333" stroke-width="5"/>',
};

/** Fondo: liso (catálogo), degradado con sombra o tela de cama con textura (foto casera). */
function fondoSvg(tipo) {
  if (tipo === 'liso') return '<rect width="100%" height="100%" fill="#ffffff"/>';
  if (tipo === 'degradado') {
    return `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8d4cc"/><stop offset="1" stop-color="#a9a49a"/></linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>`;
  }
  // Pared clara arriba y piso de madera abajo (dos colores distintos de fondo).
  return `<rect width="100%" height="100%" fill="#e9e4da"/><rect y="440" width="600" height="160" fill="#a77b52"/>
    ${Array.from({ length: 6 }, (_, i) => `<rect y="${450 + i * 25}" width="600" height="2" fill="#8c6440"/>`).join('')}`;
}

async function fotoPrenda(forma, { fondo = 'liso', formato = 'jpeg' } = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">${fondoSvg(fondo)}${SILUETAS[forma]}</svg>`;
  return sharp(Buffer.from(svg))[formato]({ quality: 90 }).toBuffer();
}

module.exports = { SILUETAS, fotoPrenda };

/** Variantes con detalles: capucha, cierre al frente y pants con puño. */
Object.assign(SILUETAS, {
  'sudadera-capucha':
    '<path d="M255,40 Q300,10 345,40 L355,105 L450,140 L540,520 L470,540 L420,300 L425,560 L175,560 L180,300 L130,540 L60,520 L150,140 L245,105 Z" fill="#7d7d7a"/>',
  'chamarra-cierre':
    '<path d="M240,110 Q300,150 360,110 L450,140 L540,520 L470,540 L420,300 L425,560 L175,560 L180,300 L130,540 L60,520 L150,140 Z" fill="#3a3b2c"/><rect x="297" y="130" width="6" height="430" fill="#c9c9c0"/>',
  jogger: '<polygon points="190,40 410,40 425,470 380,560 330,560 312,470 300,230 288,470 270,560 220,560 175,470" fill="#4a4a4f"/>',
});

// Logo claro (casi del color de la pared) en el pecho: debe conservarse en el recorte.
SILUETAS['camiseta-logo'] =
  '<path d="M240,120 Q300,160 360,120 L520,200 L470,300 L420,270 L425,560 L175,560 L180,270 L130,300 L80,200 Z" fill="#5f6b38"/><rect x="250" y="300" width="100" height="60" fill="#efeae0"/>';

// Outfit en una sola foto: playera arriba, pantalón abajo, tenis al final (flat lay).
SILUETAS['outfit-apilado'] =
  '<path d="M250,30 Q300,55 350,30 L430,70 L405,120 L380,105 L382,230 L218,230 L220,105 L195,120 L170,70 Z" fill="#b3282d"/>' +
  '<polygon points="230,260 370,260 385,520 320,520 300,330 280,520 215,520" fill="#2f4f86"/>' +
  '<ellipse cx="255" cy="565" rx="45" ry="18" fill="#222"/><ellipse cx="345" cy="565" rx="45" ry="18" fill="#222"/>';

/** Foto sintética de una persona de cuerpo entero (para las pruebas con IA). */
async function fotoPersona({ fondo = '#e9e4da' } = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="100%" height="100%" fill="${fondo}"/>
    <ellipse cx="300" cy="120" rx="55" ry="70" fill="#c99a76"/><rect x="200" y="200" width="200" height="300" rx="40" fill="#8b8b88"/>
    <rect x="215" y="500" width="70" height="330" fill="#3b5578"/><rect x="315" y="500" width="70" height="330" fill="#3b5578"/>
    <rect x="150" y="210" width="45" height="250" rx="20" fill="#c99a76"/><rect x="405" y="210" width="45" height="250" rx="20" fill="#c99a76"/></svg>`;
  return require('sharp')(Buffer.from(svg)).jpeg({ quality: 90 }).withMetadata({ exif: { IFD0: { Artist: 'gps-y-datos-privados' } } }).toBuffer();
}

module.exports.fotoPersona = fotoPersona;
