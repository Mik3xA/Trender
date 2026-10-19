const CATEGORY_DEFINITIONS = {
  calzado: {
    keywords: ['tenis', 'zapatos', 'sneakers', 'calzado', 'shoes'],
    categoria: 'Calzado',
    nombre: 'Calzado Deportivo/Casual',
    precio: '$1,499',
    imagenUrl: '/ropa/textura_calzado.png'
  },
  piernas: {
    keywords: ['pantalon', 'jeans', 'short', 'falda', 'pants'],
    categoria: 'Piernas',
    nombre: 'Pantalón / Short',
    precio: '$899',
    imagenUrl: '/ropa/textura_piernas.png'
  },
  torso: {
    keywords: ['camisa', 'playera', 'chamarra', 'vestido'],
    categoria: 'Torso',
    nombre: 'Prenda Superior',
    precio: '$799',
    imagenUrl: '/ropa/textura_torso.png'
  }
};

const TOP_KEYWORD = /\btop\b/;

function normalizeUrl(url) {
  return url
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function includesKeyword(url, keyword) {
  return url.includes(keyword);
}

function analyzeCategory(url) {
  const normalizedUrl = normalizeUrl(url);

  if (CATEGORY_DEFINITIONS.calzado.keywords.some((keyword) => includesKeyword(normalizedUrl, keyword))) {
    return CATEGORY_DEFINITIONS.calzado;
  }

  if (CATEGORY_DEFINITIONS.piernas.keywords.some((keyword) => includesKeyword(normalizedUrl, keyword))) {
    return CATEGORY_DEFINITIONS.piernas;
  }

  if (
    CATEGORY_DEFINITIONS.torso.keywords.some((keyword) => includesKeyword(normalizedUrl, keyword)) ||
    TOP_KEYWORD.test(normalizedUrl)
  ) {
    return CATEGORY_DEFINITIONS.torso;
  }

  return CATEGORY_DEFINITIONS.torso;
}

function simpleHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

async function escanearUrl(url) {
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const category = analyzeCategory(url);

  return {
    id: `scanned_${simpleHash(url + Date.now().toString())}`,
    categoria: category.categoria,
    nombre: category.nombre,
    precio: category.precio,
    imagenUrl: category.imagenUrl
  };
}

module.exports = {
  escanearUrl,
  normalizeUrl,
  analyzeCategory
};
