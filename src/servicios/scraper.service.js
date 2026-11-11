const cheerio = require('cheerio');

const pagina = require('./pagina.service');
const { normalizarUrlProducto, esIpPrivada } = require('./url.service');

/**
 * Motor de extracción multitienda.
 *
 * 1. Descarga el HTML con protección SSRF (pagina.service).
 * 2. Si la tienda bloquea (403/429, captcha, Cloudflare) y Puppeteer está
 *    instalado, renderiza la página con un navegador sin interfaz.
 * 3. Aplica el adaptador de la tienda (Amazon, Mercado Libre, Nike, Zara, H&M)
 *    y el genérico (JSON-LD, og:image, galerías) para reunir título, categoría,
 *    precio y TODAS las fotos candidatas de la galería principal.
 * 4. Filtra banners, logos, fotos de reseñas, iconos y GIF; deduplica y ordena.
 *    La elección final de la foto la hace imagen.service midiendo cada imagen.
 */

const MAX_CANDIDATAS = 8;
const DESCARTAR = /(logo|sprite|icon|favicon|banner|promo|badge|review|customer|ugc|avatar|placeholder|blank|pixel|spacer|loading|play[-_]?button|video|size[-_]?chart|guia[-_]?de[-_]?tallas|\.svg|\.gif)(\b|_|-|\.|$)/i;

const SENALES_BLOQUEO = [
  /captcha/i,
  /robot check/i,
  /api-services-support@amazon\.com/i,
  /cf-chl|challenge-platform|attention required/i,
  /account-verification|verifica(r)? que eres/i,
  /access denied/i,
];

function detectarBloqueo(html) {
  // Las páginas de bloqueo son cortas y no traen datos de producto.
  return html.length < 200000 && SENALES_BLOQUEO.some((re) => re.test(html)) && !/"@type"\s*:\s*"Product"/.test(html);
}

function tiendaDe(url) {
  const host = new URL(url).hostname.replace(/^www\d?\./, '');
  if (/(^|\.)amazon\./.test(host)) return 'amazon';
  if (/(^|\.)mercadoli(b|v)re\./.test(host)) return 'mercadolibre';
  if (/(^|\.)nike\./.test(host)) return 'nike';
  if (/(^|\.)zara\./.test(host)) return 'zara';
  if (/(^|\.)hm\.com$|(^|\.)hm\./.test(host)) return 'hm';
  return 'generica';
}

/** URL absoluta y limpia; null si no es una imagen utilizable. */
function limpiarImagen(src, base) {
  if (!src || typeof src !== 'string') return null;
  let url;
  try {
    url = new URL(src.trim().replace(/^\/\//, 'https://'), base);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || DESCARTAR.test(url.pathname)) return null;
  if (esIpPrivada(url.hostname) || url.hostname === 'localhost') return null;
  return url.href;
}

/** La URL más grande de un srcset ("a.jpg 400w, b.jpg 1200w"). */
function mayorDeSrcset(srcset) {
  if (!srcset) return null;
  const opciones = srcset
    .split(',')
    .map((parte) => parte.trim().split(/\s+/))
    .map(([url, d]) => ({ url, peso: parseFloat(d) || 0 }));
  return opciones.sort((a, b) => b.peso - a.peso)[0]?.url ?? null;
}

function srcDeImg($, el) {
  const img = $(el);
  return (
    img.attr('data-zoom') ||
    img.attr('data-zoom-image') ||
    img.attr('data-zoom-src') ||
    img.attr('data-old-hires') ||
    mayorDeSrcset(img.attr('srcset') || img.attr('data-srcset')) ||
    img.attr('data-src') ||
    img.attr('src')
  );
}

// ------------------------------------------------------------------ adaptadores

const ADAPTADORES = {
  amazon($, html) {
    const imagenes = [];
    // Galería principal en alta resolución: "colorImages": {"initial": [{"hiRes": "..."}]}
    for (const [, url] of html.matchAll(/"hiRes"\s*:\s*"(https:[^"]+)"/g)) imagenes.push(url);
    const dinamica = $('#landingImage').attr('data-a-dynamic-image');
    if (dinamica) {
      try {
        const tamanos = Object.entries(JSON.parse(dinamica)).sort((a, b) => b[1][0] * b[1][1] - a[1][0] * a[1][1]);
        imagenes.push(...tamanos.map(([url]) => url));
      } catch {
        /* JSON roto */
      }
    }
    imagenes.push($('#landingImage').attr('data-old-hires'), $('#imgBlkFront').attr('src'));
    return {
      titulo: $('#productTitle').text().trim() || null,
      migas: $('#wayfinding-breadcrumbs_feature_div a').map((_, a) => $(a).text().trim()).get(),
      precio: $('.a-price .a-offscreen').first().text().trim() || null,
      marca: $('#bylineInfo').text().replace(/^(Marca|Visita la tienda de|Brand|Visit the)\s*:?\s*/i, '').trim() || null,
      imagenes,
    };
  },

  mercadolibre($) {
    return {
      titulo: $('h1.ui-pdp-title').text().trim() || null,
      migas: $('.andes-breadcrumb__link, .andes-breadcrumb__item a').map((_, a) => $(a).text().trim()).get(),
      precio: $('meta[itemprop="price"]').attr('content') || null,
      // Galería: data-zoom trae la versión grande (-F / -O).
      imagenes: $('.ui-pdp-gallery__figure img, figure.ui-pdp-gallery__figure img')
        .map((_, el) => srcDeImg($, el))
        .get()
        .map((u) => u.replace(/-[IOVR]\.(jpg|jpeg|webp)$/i, '-F.$1')),
    };
  },

  nike($) {
    const imagenes = [];
    const datos = $('#__NEXT_DATA__').html();
    if (datos) {
      for (const [, url] of datos.matchAll(/"(?:portraitURL|squarishURL|imageUrl|src)"\s*:\s*"(https:\/\/static\.nike\.com[^"]+)"/g)) imagenes.push(url);
    }
    $('[data-testid*="HeroImg"] img, [data-testid*="Thumbnail"] img, .css-1fxh5tw img').each((_, el) => imagenes.push(srcDeImg($, el)));
    return { titulo: $('#pdp_product_title, h1[data-testid="product_title"]').first().text().trim() || null, imagenes };
  },

  zara($) {
    const imagenes = $('.media-image img, picture.media-image__image img, .product-detail-images img')
      .map((_, el) => srcDeImg($, el))
      .get()
      // Zara sirve tamaños con ?w=: se pide uno grande.
      .map((u) => (u ? u.replace(/([?&])w=\d+/, '$1w=1024') : u));
    return { titulo: $('h1.product-detail-info__header-name, h1').first().text().trim() || null, imagenes };
  },

  hm($) {
    const imagenes = $('.product-detail-main-image-container img, figure.pdp-image img, [data-testid="grid-gallery"] img, ul.product-detail-images img')
      .map((_, el) => srcDeImg($, el))
      .get();
    return {
      titulo: $('h1.product-item-headline, h1').first().text().trim() || null,
      migas: $('nav[aria-label*="readcrumb"] a, .breadcrumbs-list a').map((_, a) => $(a).text().trim()).get(),
      imagenes,
    };
  },

  /** Cualquier tienda: imágenes dentro de contenedores de galería del producto. */
  generica($) {
    const imagenes = [];
    $('[class*="gallery"] img, [id*="gallery"] img, [class*="carousel"] img, [class*="product-image"] img, [class*="pdp"] img, [class*="zoom"] img, [itemprop="image"]').each(
      (_, el) => {
        const nodo = $(el);
        imagenes.push(nodo.is('img') ? srcDeImg($, el) : nodo.attr('content') || nodo.attr('src'));
      }
    );
    $('link[rel="image_src"]').each((_, el) => imagenes.push($(el).attr('href')));
    return { imagenes };
  },
};

/** Imágenes del JSON-LD Product (las más fiables: son las que la tienda declara). */
function imagenesJsonLd($) {
  const imagenes = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const pila = [JSON.parse($(el).html())];
      while (pila.length) {
        const nodo = pila.pop();
        if (Array.isArray(nodo)) pila.push(...nodo);
        else if (nodo && typeof nodo === 'object') {
          if (nodo['@graph']) pila.push(nodo['@graph']);
          const tipo = [].concat(nodo['@type'] ?? []);
          if (tipo.includes('Product') || tipo.includes('ProductGroup')) {
            for (const img of [].concat(nodo.image ?? [])) imagenes.push(typeof img === 'string' ? img : img?.url ?? img?.contentUrl);
            if (Array.isArray(nodo.hasVariant)) pila.push(...nodo.hasVariant);
          }
        }
      }
    } catch {
      /* bloque JSON-LD mal formado */
    }
  });
  return imagenes;
}

/** Analiza el HTML ya descargado. Exportada para probar los adaptadores sin red. */
function analizarHtml(html, url) {
  const $ = cheerio.load(html);
  const tienda = tiendaDe(url);
  const meta = pagina.extraerMetadatos(html);
  const propio = tienda !== 'generica' ? ADAPTADORES[tienda]($, html) : {};
  const generico = ADAPTADORES.generica($);

  // Orden de confianza: galería propia de la tienda > JSON-LD > og:image > galería genérica.
  const brutas = [
    ...(propio.imagenes ?? []).map((src, i) => ({ src, fuente: `galeria-${tienda}`, prioridad: 10 - Math.min(i, 5) })),
    ...imagenesJsonLd($).map((src, i) => ({ src, fuente: 'json-ld', prioridad: 8 - Math.min(i, 5) })),
    { src: meta.imagen, fuente: 'og:image', prioridad: 7 },
    ...generico.imagenes.map((src, i) => ({ src, fuente: 'galeria', prioridad: 4 - Math.min(i, 3) })),
  ];
  const vistas = new Map();
  for (const c of brutas) {
    const limpia = limpiarImagen(c.src, url);
    if (!limpia) continue;
    const clave = limpia.replace(/[?#].*$/, '');
    const previa = vistas.get(clave);
    if (!previa || previa.prioridad < c.prioridad) vistas.set(clave, { url: limpia, fuente: c.fuente, prioridad: c.prioridad });
  }
  const imagenes = [...vistas.values()].sort((a, b) => b.prioridad - a.prioridad).slice(0, MAX_CANDIDATAS);

  return {
    tienda,
    titulo: propio.titulo || meta.titulo || null,
    descripcion: meta.descripcion,
    categoriaTienda: [meta.categoria, ...(propio.migas ?? []), ...(meta.migas ?? [])].filter(Boolean).join(' > ') || null,
    precio: propio.precio || meta.precio || null,
    moneda: meta.moneda,
    marca: propio.marca || meta.marca || null,
    color: meta.color,
    imagenes,
  };
}

// ------------------------------------------------------------------ navegador (opcional)

/** Puppeteer es opcional (npm install puppeteer): solo se usa si las tiendas bloquean. */
function cargarPuppeteer() {
  try {
    return require('puppeteer');
  } catch {
    return null;
  }
}

async function renderizarConNavegador(url) {
  const puppeteer = cargarPuppeteer();
  if (!puppeteer) return null;
  const navegador = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const pestana = await navegador.newPage();
    await pestana.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
    );
    await pestana.setRequestInterception(true);
    pestana.on('request', (peticion) => {
      // Sin fuentes ni vídeo (más rápido) y nunca hacia la red interna.
      let host = '';
      try {
        host = new URL(peticion.url()).hostname;
      } catch {
        /* data:, blob: */
      }
      const interno = host === 'localhost' || esIpPrivada(host);
      if (interno || ['font', 'media'].includes(peticion.resourceType())) peticion.abort();
      else peticion.continue();
    });
    await pestana.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });
    return await pestana.content();
  } finally {
    await navegador.close();
  }
}

/**
 * Extrae los datos del producto y sus fotos candidatas.
 * @param {string} url
 * @param {{ leerPagina?: boolean, usarNavegador?: boolean }} [opciones]
 */
async function extraerProducto(url, opciones = {}) {
  const { leerPagina = process.env.SCAN_FETCH_PAGES !== 'false', usarNavegador = process.env.SCRAPER_BROWSER !== 'false' } = opciones;
  const urlNormalizada = normalizarUrlProducto(url);
  const vacio = { url: urlNormalizada, tienda: tiendaDe(urlNormalizada), imagenes: [], metodo: 'url', bloqueado: false };
  if (!leerPagina) return vacio;

  let html = null;
  let bloqueado = false;
  try {
    html = (await pagina.obtenerHtml(urlNormalizada)).html;
    bloqueado = detectarBloqueo(html);
  } catch (err) {
    bloqueado = err.code === 'TIENDA_BLOQUEADA';
    if (!bloqueado && err.statusCode === 400) throw err; // URL interna o inválida
  }

  let metodo = 'http';
  if ((bloqueado || !html) && usarNavegador) {
    try {
      const renderizado = await renderizarConNavegador(urlNormalizada);
      if (renderizado && !detectarBloqueo(renderizado)) {
        html = renderizado;
        bloqueado = false;
        metodo = 'navegador';
      }
    } catch {
      /* el navegador también falló: se sigue con lo que haya */
    }
  }
  if (!html || bloqueado) return { ...vacio, bloqueado };
  return { url: urlNormalizada, ...analizarHtml(html, urlNormalizada), metodo, bloqueado: false };
}

module.exports = { extraerProducto, analizarHtml, detectarBloqueo, tiendaDe, limpiarImagen, mayorDeSrcset };

