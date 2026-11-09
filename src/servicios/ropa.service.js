const { generarId } = require('./db.service');

/**
 * Escáner de links de tiendas: deduce la categoría de la prenda a partir de
 * las palabras de la URL y devuelve la textura de prueba que usa el visor 3D.
 * (Las imágenes /ropa/*.png las sirve el frontend.)
 */
const CATEGORIAS = {
  calzado: {
    keywords: ['tenis', 'zapato', 'zapatilla', 'sneaker', 'calzado', 'shoe', 'bota', 'sandalia'],
    categoria: 'Calzado',
    closet: 'shoes',
    nombre: 'Calzado Deportivo/Casual',
    precio: '$1,499',
    imagenUrl: '/ropa/textura_calzado.png',
  },
  piernas: {
    keywords: ['pantalon', 'jean', 'jeans', 'short', 'falda', 'pants', 'jogger', 'legging', 'chino'],
    categoria: 'Piernas',
    closet: 'bottom',
    nombre: 'Pantalón / Short',
    precio: '$899',
    imagenUrl: '/ropa/textura_piernas.png',
  },
  torso: {
    keywords: ['camisa', 'playera', 'camiseta', 'chamarra', 'chaqueta', 'vestido', 'blusa', 'sudadera', 'top', 'shirt'],
    categoria: 'Torso',
    closet: 'top',
    nombre: 'Prenda Superior',
    precio: '$799',
    imagenUrl: '/ropa/textura_torso.png',
  },
};

// Orden de prioridad: un link de "tenis" con "camisa" en el slug sigue siendo calzado.
const ORDEN = [CATEGORIAS.calzado, CATEGORIAS.piernas, CATEGORIAS.torso];
const RETARDO_MS = Number(process.env.SCAN_DELAY_MS ?? 1200);

/** Minúsculas y sin acentos: "Pantalón" -> "pantalon". */
function normalizarTexto(texto) {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Palabras de la ruta y la consulta de la URL (el dominio no cuenta). */
function palabrasDeUrl(url) {
  let texto = url;
  try {
    const u = new URL(url);
    texto = `${decodeURIComponent(u.pathname)} ${decodeURIComponent(u.search)}`;
  } catch {
    /* no es URL absoluta: se analiza el texto tal cual */
  }
  return normalizarTexto(texto).split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Coincidencia por palabra completa (admite plural -s/-es), para evitar
 * falsos positivos como "short" dentro de "shortcut" o "pants" en "participants".
 */
function contieneKeyword(palabras, keyword) {
  return palabras.some((p) => p === keyword || p === `${keyword}s` || p === `${keyword}es`);
}

/** Categoría detectada; si no hay coincidencias se asume una prenda superior. */
function analizarCategoria(url) {
  const palabras = palabrasDeUrl(url);
  return ORDEN.find((cat) => cat.keywords.some((k) => contieneKeyword(palabras, k))) ?? CATEGORIAS.torso;
}

/** Categoría del armario (top/bottom/shoes) deducida del link. */
function categoriaArmario(url) {
  return analizarCategoria(url).closet;
}

async function escanearUrl(url) {
  if (RETARDO_MS > 0) await new Promise((resolve) => setTimeout(resolve, RETARDO_MS));
  const cat = analizarCategoria(url);
  return {
    id: `scanned_${generarId()}`,
    categoria: cat.categoria,
    nombre: cat.nombre,
    precio: cat.precio,
    imagenUrl: cat.imagenUrl,
  };
}

module.exports = { escanearUrl, analizarCategoria, categoriaArmario, normalizarTexto };
