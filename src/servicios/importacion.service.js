const fs = require('fs');
const path = require('path');

const pagina = require('./pagina.service');
const scraper = require('./scraper.service');
const imagen = require('./imagen.service');
const vision = require('./vision.service');
const ropa = require('./ropa.service');

/**
 * Importación de una prenda desde el link de una tienda (trabajo en segundo plano).
 *
 *   scraper  ->  evaluar hasta 6 fotos  ->  elegir la más limpia  ->  quitar fondo
 *            ->  silueta  ->  combinar opinión del texto y de la imagen  ->  guardar
 *
 * También procesa FOTOS subidas por el usuario (o un link directo a una
 * imagen): recorte tolerante a fondos caseros + análisis visual completo.
 *
 * El endpoint responde 202 al instante con la prenda en estado "processing";
 * el frontend consulta GET /api/closet/:id hasta ver "ready", "review" o "failed".
 */

const CONCURRENCIA = 2;
const MAX_FOTOS_EVALUADAS = 6;
const CATEGORIA_ARMARIO = { Torso: 'top', Piernas: 'bottom', Vestido: 'dress', Calzado: 'shoes' };
const TIPO_POR_DEFECTO = { Torso: 'camiseta', Piernas: 'pantalon', Vestido: 'vestido', Calzado: 'tenis' };
const NOMBRE_FUENTE = { categoria: 'categoría de la tienda', titulo: 'título del producto', url: 'palabras del link', descripcion: 'descripción', nombre: 'nombre que escribiste' };
const ES_IMAGEN = /\.(jpe?g|png|webp|avif)$/i;
const SUGERENCIA_FOTO = 'Sube una foto o captura de la prenda con el botón "Subir foto".';

// ------------------------------------------------------------------ cola

const cola = [];
let activos = 0;

function siguiente() {
  while (activos < CONCURRENCIA && cola.length) {
    const { tarea, resolver } = cola.shift();
    activos += 1;
    Promise.resolve()
      .then(tarea)
      .catch(() => undefined)
      .finally(() => {
        activos -= 1;
        resolver();
        siguiente();
      });
  }
}

/** Encola una tarea; la promesa se resuelve cuando termina (útil en pruebas). */
function encolar(tarea) {
  return new Promise((resolver) => {
    cola.push({ tarea, resolver });
    siguiente();
  });
}

// ------------------------------------------------------------------ análisis

/** Descarga y puntúa las fotos candidatas; devuelve las válidas de mejor a peor. */
async function evaluarFotos(candidatas) {
  const resultados = await Promise.all(
    candidatas.slice(0, MAX_FOTOS_EVALUADAS).map(async (candidata, orden) => {
      try {
        const { buffer } = await pagina.obtenerImagen(candidata.url);
        const evaluacion = await imagen.evaluarImagen(buffer);
        // A igualdad de calidad manda el orden de la galería (la primera suele ser la principal).
        return { ...candidata, buffer, evaluacion, total: evaluacion.puntaje + candidata.prioridad * 0.05 - orden * 0.01 };
      } catch {
        return null; // 404, no es imagen, demasiado grande...
      }
    })
  );
  return resultados.filter(Boolean).sort((a, b) => b.total - a.total);
}

/** Recorta la mejor foto que tenga fondo liso. */
async function recortarMejor(fotos) {
  for (const foto of fotos) {
    try {
      const recorte = await imagen.quitarFondo(foto.buffer);
      return { foto, recorte };
    } catch {
      /* fondo no liso: se prueba la siguiente */
    }
  }
  return null;
}

/**
 * Decide categoría y tipo combinando el texto (título, categoría de la tienda,
 * URL o el nombre que escribió el usuario) con el análisis visual de la foto.
 * El texto manda si es claro; la imagen decide cuando el texto no basta; si
 * ninguno es concluyente se pide al usuario.
 * @param {object} texto resultado de ropa.clasificar
 * @param {object|null} visual resultado de vision.analizarPrenda
 */
function decidir(texto, visual) {
  const evidencias = [];
  for (const fuente of texto.fuentes ?? []) evidencias.push(`${NOMBRE_FUENTE[fuente] ?? fuente}: ${texto.tipo}`);
  for (const motivo of visual?.evidencias ?? []) evidencias.push(`foto: ${motivo}`);
  const [mejorImagen, puntosImagen] = Object.entries(visual?.puntos ?? {}).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const imagenDecide = visual?.categoria && (visual.confianza === 'alta' || visual.confianza === 'media');

  if (texto.categoria && (texto.confianza === 'alta' || texto.confianza === 'media')) {
    const coincide = mejorImagen === texto.categoria;
    if (coincide || !imagenDecide || texto.confianza === 'alta') {
      return { categoria: texto.categoria, tipo: texto.tipo, confianza: coincide && puntosImagen > 0 ? 'alta' : texto.confianza, evidencias };
    }
    // El texto dice una cosa y la foto otra con seguridad: que confirme el usuario.
    return { categoria: null, tipo: null, confianza: 'baja', evidencias: [...evidencias, `el texto y la foto no coinciden (${texto.categoria} / ${visual.categoria})`] };
  }
  if (imagenDecide) {
    const deAcuerdo = texto.categoria === visual.categoria;
    return {
      categoria: visual.categoria,
      tipo: deAcuerdo ? texto.tipo : visual.tipo ?? TIPO_POR_DEFECTO[visual.categoria],
      confianza: deAcuerdo || visual.confianza === 'alta' ? 'alta' : 'media',
      evidencias,
    };
  }
  if (texto.categoria) return { categoria: texto.categoria, tipo: texto.tipo, confianza: 'baja', evidencias };
  if (visual?.categoria) return { categoria: visual.categoria, tipo: visual.tipo, confianza: 'baja', evidencias };
  return { categoria: null, tipo: null, confianza: 'ninguna', evidencias };
}

/** Datos del análisis visual que se guardan con la prenda (para la interfaz y el 3D). */
function resumenVisual(visual) {
  if (!visual) return null;
  const { categoria, tipo, confianza, puntos, detalle, zonas, rasgos, nombreSugerido } = visual;
  return { categoria, tipo, confianza, puntos, detalle, zonas, rasgos, nombreSugerido };
}

/**
 * Procesa una prenda ya registrada en estado "processing".
 * @param {{ id: string, user_id: string, source_url: string, category?: string|null }} item
 * @param {{ actualizar: Function, rutaAbsoluta: Function, rutaImagen: Function }} deps funciones de closet.service
 */
async function procesar(item, deps) {
  try {
    // Link directo a una foto (clic derecho > "Copiar dirección de imagen"): se trata como foto subida.
    if (ES_IMAGEN.test(new URL(item.source_url).pathname)) {
      const { buffer } = await pagina.obtenerImagen(item.source_url);
      await procesarFoto(item, buffer, { nombre: ropa.nombreDesdeUrl(item.source_url), origen: 'link de imagen' }, deps);
      return;
    }

    const producto = await scraper.extraerProducto(item.source_url);
    const texto = ropa.clasificar({
      categoria: producto.categoriaTienda,
      titulo: producto.titulo,
      url: producto.url,
      descripcion: producto.descripcion,
    });
    if (texto.accesorio) {
      deps.actualizar(item.id, {
        status: 'failed',
        error: 'Parece un accesorio: el probador viste prendas superiores, inferiores, vestidos y calzado.',
      });
      return;
    }

    const fotos = await evaluarFotos(producto.imagenes ?? []);
    let recorte = fotos.length ? await recortarMejor(fotos) : null;
    // Ninguna foto de catálogo con fondo liso: se intenta el recorte tolerante con la mejor.
    if (!recorte && fotos.length) {
      try {
        recorte = { foto: fotos[0], recorte: await imagen.quitarFondo(fotos[0].buffer, { tolerante: true }) };
      } catch {
        recorte = null;
      }
    }
    const visual = recorte ? await vision.analizarPrenda(recorte.recorte.png) : null;
    const decision = decidir(texto, visual);
    const imagePath = recorte ? guardarRecorte(item, recorte.recorte.png, deps) : null;
    const colorTexto = ropa.detectarColor(producto.color, producto.titulo, new URL(producto.url).pathname);
    const color = colorTexto?.hex ?? visual?.color?.principal.hex ?? null;

    // Sin foto utilizable la prenda se guarda con lo que dice el link y se pide una foto.
    const avisos = [];
    if (!recorte) {
      const motivo = producto.bloqueado
        ? 'La tienda bloqueó la lectura automática: se analizó solo el link.'
        : !producto.imagenes?.length
          ? 'No se encontraron fotos del producto.'
          : 'No se pudo recortar la prenda de las fotos de la tienda.';
      avisos.push(motivo, 'Añade una foto o captura de la prenda para verla en el avatar.');
    }

    const categoriaUsuario = item.category ?? null;
    const categoria = categoriaUsuario ?? (decision.categoria ? CATEGORIA_ARMARIO[decision.categoria] : null);
    deps.actualizar(item.id, {
      status: categoria ? 'ready' : 'review',
      category: categoria,
      tipo: decision.tipo,
      nombre: producto.titulo || ropa.nombreDesdeUrl(producto.url) || visual?.nombreSugerido || 'Prenda',
      color,
      tienda: producto.tienda === 'generica' ? new URL(producto.url).hostname.replace(/^www\d?\./, '') : producto.tienda,
      precio: ropa.formatearPrecio(producto.precio, producto.moneda),
      image_path: imagePath,
      imagen_origen: recorte?.foto.url ?? null,
      error: null,
      analisis_json: JSON.stringify({
        origen: 'tienda',
        sinFoto: !recorte,
        confianza: decision.confianza,
        evidencias: decision.evidencias,
        avisos,
        metodoLectura: producto.metodo,
        metodoRecorte: recorte?.recorte.metodo ?? null,
        fotosEvaluadas: fotos.map((f) => ({ url: f.url, fuente: f.fuente, ...f.evaluacion })),
        visual: resumenVisual(visual),
      }),
    });
  } catch (err) {
    deps.actualizar(item.id, {
      status: 'failed',
      error: `${err.statusCode && err.statusCode < 500 ? err.message : 'No se pudo leer el link.'} ${SUGERENCIA_FOTO}`.trim(),
    });
  }
}

function guardarRecorte(item, png, deps) {
  const imagePath = deps.rutaImagen(item);
  const destino = deps.rutaAbsoluta(imagePath);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, png);
  return imagePath;
}

/**
 * Procesa una FOTO de la prenda (subida por el usuario o desde un link directo).
 * Sin texto de tienda: la imagen decide, ayudada por el nombre si lo escribió.
 * @param {{ id: string, user_id: string, category?: string|null }} item
 * @param {Buffer} buffer imagen original
 * @param {{ nombre?: string|null, origen?: string }} opciones
 */
async function procesarFoto(item, buffer, { nombre = null, origen = 'foto subida', conservar = null } = {}, deps) {
  try {
    const calidad = await imagen.evaluarImagen(buffer);
    const recorte = await imagen.quitarFondo(buffer, { tolerante: true });
    const visual = await vision.analizarPrenda(recorte.png);
    const texto = nombre ? ropa.clasificar({ titulo: nombre }) : { categoria: null, tipo: null, confianza: 'ninguna', fuentes: [] };
    texto.fuentes = (texto.fuentes ?? []).map((f) => (f === 'titulo' ? 'nombre' : f));
    const decision = decidir(texto, visual);

    const avisos = [];
    if (calidad.fraccionPiel > 0.15) avisos.push('Se ve piel en la foto: el resultado es mejor con la prenda sola, extendida o en gancho.');
    if (Math.min(calidad.ancho, calidad.alto) < 400) avisos.push('La foto es pequeña: con más resolución la prenda se verá más nítida.');
    if (recorte.metodo === 'recorte-tolerante') avisos.push('El fondo no era liso: revisa que el recorte haya quedado bien.');
    if (decision.confianza === 'baja') avisos.push('No estamos seguros del tipo de prenda: confírmalo en el armario.');

    const imagePath = guardarRecorte(item, recorte.png, deps);
    const categoriaUsuario = item.category ?? null;
    const categoria = categoriaUsuario ?? (decision.categoria && decision.confianza !== 'baja' ? CATEGORIA_ARMARIO[decision.categoria] : null);
    deps.actualizar(item.id, {
      status: categoria ? 'ready' : 'review',
      category: categoria ?? (decision.categoria ? CATEGORIA_ARMARIO[decision.categoria] : null),
      tipo: decision.tipo,
      nombre: nombre || visual?.nombreSugerido || 'Prenda',
      color: visual?.color?.principal.hex ?? null,
      tienda: conservar?.tienda ?? null,
      precio: conservar?.precio ?? null,
      image_path: imagePath,
      error: null,
      analisis_json: JSON.stringify({
        origen,
        confianza: decision.confianza,
        evidencias: decision.evidencias,
        avisos,
        metodoRecorte: recorte.metodo,
        calidadFoto: calidad,
        visual: resumenVisual(visual),
      }),
    });
  } catch (err) {
    deps.actualizar(item.id, {
      status: 'failed',
      error: err.statusCode && err.statusCode < 500 ? err.message : 'No se pudo analizar la foto',
    });
  }
}

module.exports = { encolar, procesar, procesarFoto, decidir, evaluarFotos, CATEGORIA_ARMARIO };
