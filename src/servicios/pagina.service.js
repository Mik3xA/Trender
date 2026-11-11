const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');

const { errorOperacional } = require('./errores.service');
const { esIpPrivada } = require('./url.service');

const TIEMPO_MAXIMO_MS = 6000;
const BYTES_MAXIMOS = 1.5 * 1024 * 1024;
const REDIRECCIONES_MAXIMAS = 3;
const AGENTE = 'Mozilla/5.0 (compatible; TrenderBot/1.0; +https://trender.app)';

/**
 * Resolución DNS que rechaza direcciones internas. Se usa como `lookup` del
 * socket, así se valida la IP a la que realmente se conecta (evita SSRF y
 * DNS rebinding: no hay una segunda resolución entre la comprobación y la conexión).
 */
function lookupSeguro(hostname, opciones, callback) {
  dns.lookup(hostname, { ...opciones, all: true }, (err, direcciones) => {
    if (err) return callback(err);
    const lista = Array.isArray(direcciones) ? direcciones : [{ address: direcciones, family: net.isIP(direcciones) }];
    if (!lista.length || lista.some((d) => esIpPrivada(d.address))) {
      return callback(errorOperacional(400, 'La URL apunta a una red interna'));
    }
    if (opciones.all) return callback(null, lista);
    return callback(null, lista[0].address, lista[0].family);
  });
}

/**
 * Petición GET segura. Devuelve el cuerpo como Buffer (como mucho `maxBytes`)
 * junto con el estado y el tipo de contenido; las redirecciones se resuelven fuera.
 */
function pedir(url, { permitirRedesPrivadas = false, maxBytes = BYTES_MAXIMOS, aceptar = 'text/html,application/xhtml+xml', tiempoMs = TIEMPO_MAXIMO_MS } = {}) {
  return new Promise((resolve, reject) => {
    const destino = new URL(url);
    // Con una IP literal Node no llama a `lookup`: se valida aquí.
    const ipLiteral = destino.hostname.replace(/^\[|\]$/g, '');
    if (!permitirRedesPrivadas && (net.isIP(ipLiteral) ? esIpPrivada(ipLiteral) : destino.hostname === 'localhost')) {
      return reject(errorOperacional(400, 'La URL apunta a una red interna'));
    }
    const cliente = destino.protocol === 'https:' ? https : http;
    const solicitud = cliente.get(
      destino,
      {
        headers: { 'User-Agent': AGENTE, Accept: aceptar, 'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8' },
        lookup: permitirRedesPrivadas ? undefined : lookupSeguro,
        timeout: tiempoMs,
      },
      (respuesta) => {
        const { statusCode = 0, headers } = respuesta;
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          respuesta.resume();
          return resolve({ redireccion: new URL(headers.location, destino).href });
        }
        const trozos = [];
        let total = 0;
        let truncado = false;
        respuesta.on('data', (trozo) => {
          if (truncado) return;
          total += trozo.length;
          if (total > maxBytes) {
            truncado = true;
            solicitud.destroy();
            return resolve({ estado: statusCode, tipo: String(headers['content-type'] || ''), cuerpo: Buffer.concat(trozos), truncado });
          }
          trozos.push(trozo);
        });
        respuesta.on('end', () => {
          if (!truncado) resolve({ estado: statusCode, tipo: String(headers['content-type'] || ''), cuerpo: Buffer.concat(trozos), truncado });
        });
        respuesta.on('error', reject);
      }
    );
    solicitud.on('timeout', () => solicitud.destroy(errorOperacional(504, 'La tienda tardó demasiado en responder')));
    solicitud.on('error', reject);
  });
}

/** Sigue hasta 3 redirecciones; cada salto pasa por la misma validación SSRF. */
async function pedirSiguiendo(url, opciones) {
  let actual = url;
  for (let salto = 0; salto <= REDIRECCIONES_MAXIMAS; salto += 1) {
    const protocolo = new URL(actual).protocol;
    if (protocolo !== 'http:' && protocolo !== 'https:') {
      throw errorOperacional(400, 'Solo se admiten URLs http o https');
    }
    const resultado = await pedir(actual, opciones);
    if (!resultado.redireccion) return { url: actual, ...resultado };
    actual = resultado.redireccion;
  }
  throw errorOperacional(502, 'Demasiadas redirecciones');
}

/**
 * Descarga el HTML de una página de producto (solo http/https públicos).
 * @returns {Promise<{ url: string, html: string, estado: number }>}
 */
async function obtenerHtml(url, opciones = {}) {
  const r = await pedirSiguiendo(url, opciones);
  if (r.estado >= 400) {
    const err = errorOperacional(502, `La tienda respondió ${r.estado}`, r.estado === 403 || r.estado === 429 ? 'TIENDA_BLOQUEADA' : 'TIENDA_ERROR');
    err.html = r.cuerpo.toString('utf8');
    throw err;
  }
  if (!/text\/html|application\/xhtml/i.test(r.tipo)) {
    throw errorOperacional(415, 'El enlace no es una página de producto');
  }
  // Truncada o completa: los metadatos del producto están al principio.
  return { url: r.url, html: r.cuerpo.toString('utf8'), estado: r.estado };
}

/**
 * Descarga una imagen (jpg/png/webp/avif/gif) con las mismas protecciones.
 * @returns {Promise<{ url: string, buffer: Buffer, tipo: string }>}
 */
async function obtenerImagen(url, { maxBytes = 8 * 1024 * 1024, ...opciones } = {}) {
  const r = await pedirSiguiendo(url, { ...opciones, maxBytes, aceptar: 'image/avif,image/webp,image/png,image/jpeg,image/*' });
  if (r.estado >= 400) throw errorOperacional(502, `La imagen respondió ${r.estado}`);
  if (!/^image\//i.test(r.tipo)) throw errorOperacional(415, 'El recurso no es una imagen');
  if (r.truncado) throw errorOperacional(413, 'La imagen es demasiado grande');
  return { url: r.url, buffer: r.cuerpo, tipo: r.tipo };
}

// ------------------------------------------------------------ extracción de metadatos

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodificarEntidades(texto) {
  return String(texto)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, nombre) => {
      if (ENTIDADES[nombre.toLowerCase()]) return ENTIDADES[nombre.toLowerCase()];
      // &aacute; &ntilde; &uuml; ... -> letra + marca diacrítica combinada.
      const marca = { acute: '\u0301', grave: '\u0300', uml: '\u0308', circ: '\u0302', tilde: '\u0303', cedil: '\u0327' };
      const partes = nombre.match(/^([a-z])(acute|grave|uml|circ|tilde|cedil)$/i);
      return partes ? `${partes[1]}${marca[partes[2].toLowerCase()]}`.normalize('NFC') : m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function atributos(etiqueta) {
  const resultado = {};
  for (const [, nombre, , valor1, valor2] of etiqueta.matchAll(/([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    resultado[nombre.toLowerCase()] = valor1 ?? valor2;
  }
  return resultado;
}

/** Recorre JSON-LD (objetos, arreglos y @graph) devolviendo cada nodo. */
function* nodosJsonLd(valor) {
  if (Array.isArray(valor)) {
    for (const v of valor) yield* nodosJsonLd(v);
  } else if (valor && typeof valor === 'object') {
    yield valor;
    if (valor['@graph']) yield* nodosJsonLd(valor['@graph']);
  }
}

function esTipo(nodo, tipo) {
  const t = nodo['@type'];
  return Array.isArray(t) ? t.includes(tipo) : t === tipo;
}

function primero(valor) {
  return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * Extrae del HTML lo que describe al producto: título, categoría de la
 * tienda (JSON-LD y migas de pan), imagen, precio, marca y color.
 */
function extraerMetadatos(html) {
  const meta = {};
  for (const [etiqueta] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = atributos(etiqueta);
    const clave = (a.property || a.name || a.itemprop || '').toLowerCase();
    if (clave && a.content && !(clave in meta)) meta[clave] = decodificarEntidades(a.content);
  }

  const datos = {
    titulo: meta['og:title'] || meta['twitter:title'] || null,
    descripcion: meta['og:description'] || meta.description || null,
    imagen: meta['og:image'] || meta['og:image:secure_url'] || meta['twitter:image'] || null,
    precio: meta['product:price:amount'] || meta['og:price:amount'] || null,
    moneda: meta['product:price:currency'] || meta['og:price:currency'] || null,
    marca: meta['product:brand'] || null,
    color: meta['product:color'] || null,
    categoria: meta['product:category'] || null,
    migas: [],
  };

  if (!datos.titulo) {
    const titulo = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titulo) datos.titulo = decodificarEntidades(titulo[1]);
  }

  for (const [, contenido] of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let json;
    try {
      json = JSON.parse(contenido.trim());
    } catch {
      continue; // JSON-LD mal formado: se ignora ese bloque
    }
    for (const nodo of nodosJsonLd(json)) {
      if (esTipo(nodo, 'Product') || esTipo(nodo, 'ProductGroup')) {
        const oferta = primero(nodo.offers) || {};
        datos.titulo = nodo.name ? decodificarEntidades(nodo.name) : datos.titulo;
        datos.categoria = nodo.category ? decodificarEntidades(primero(nodo.category)) : datos.categoria;
        const imagen = primero(nodo.image);
        datos.imagen = (typeof imagen === 'string' ? imagen : imagen?.url) || datos.imagen;
        datos.precio = oferta.price ?? oferta.lowPrice ?? datos.precio;
        datos.moneda = oferta.priceCurrency || datos.moneda;
        datos.marca = (typeof nodo.brand === 'string' ? nodo.brand : nodo.brand?.name) || datos.marca;
        datos.color = nodo.color || datos.color;
      }
      if (esTipo(nodo, 'BreadcrumbList') && Array.isArray(nodo.itemListElement)) {
        for (const item of nodo.itemListElement) {
          const nombre = item?.name ?? item?.item?.name;
          if (nombre) datos.migas.push(decodificarEntidades(nombre));
        }
      }
    }
  }

  if (datos.precio !== null && datos.precio !== undefined) datos.precio = String(datos.precio);
  return datos;
}

module.exports = { obtenerHtml, obtenerImagen, extraerMetadatos, lookupSeguro };
