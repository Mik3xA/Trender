const fs = require('fs');
const path = require('path');

const pagina = require('./pagina.service');
const scraper = require('./scraper.service');
const imagen = require('./imagen.service');
const ropa = require('./ropa.service');

/**
 * Importación de una prenda desde el link de una tienda (trabajo en segundo plano).
 *
 *   scraper  ->  evaluar hasta 6 fotos  ->  elegir la más limpia  ->  quitar fondo
 *            ->  silueta  ->  combinar opinión del texto y de la imagen  ->  guardar
 *
 * El endpoint responde 202 al instante con la prenda en estado "processing";
 * el frontend consulta GET /api/closet/:id hasta ver "ready", "review" o "failed".
 */

const CONCURRENCIA = 2;
const MAX_FOTOS_EVALUADAS = 6;
const CATEGORIA_ARMARIO = { Torso: 'top', Piernas: 'bottom', Vestido: 'dress', Calzado: 'shoes' };
const TIPO_POR_DEFECTO = { Torso: 'camiseta', Piernas: 'pantalon', Vestido: 'vestido', Calzado: 'tenis' };
const NOMBRE_FUENTE = { categoria: 'categoría de la tienda', titulo: 'título del producto', url: 'palabras del link', descripcion: 'descripción' };

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
 * URL) con la silueta de la foto. El texto manda si es claro; la silueta
 * decide cuando el texto no basta; si ninguno es concluyente se pide al usuario.
 */
function decidir(texto, silueta) {
  const evidencias = [];
  for (const fuente of texto.fuentes ?? []) evidencias.push(`${NOMBRE_FUENTE[fuente]}: ${texto.tipo}`);
  const votos = silueta ? imagen.votarSilueta(silueta) : { votos: {}, motivos: [] };
  for (const motivo of votos.motivos) evidencias.push(`silueta de la foto: ${motivo}`);
  const [mejorImagen, puntosImagen] = Object.entries(votos.votos).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];

  if (texto.categoria && (texto.confianza === 'alta' || texto.confianza === 'media')) {
    const coincide = mejorImagen === texto.categoria || puntosImagen === 0;
    return {
      categoria: texto.categoria,
      tipo: texto.tipo,
      confianza: coincide && puntosImagen > 0 ? 'alta' : texto.confianza,
      evidencias,
    };
  }
  if (puntosImagen >= 2) {
    const deAcuerdo = texto.categoria === mejorImagen;
    return {
      categoria: mejorImagen,
      tipo: deAcuerdo ? texto.tipo : TIPO_POR_DEFECTO[mejorImagen],
      confianza: deAcuerdo ? 'alta' : 'media',
      evidencias,
    };
  }
  if (texto.categoria) return { categoria: texto.categoria, tipo: texto.tipo, confianza: 'baja', evidencias };
  return { categoria: null, tipo: null, confianza: 'ninguna', evidencias };
}

/**
 * Procesa una prenda ya registrada en estado "processing".
 * @param {{ id: string, user_id: string, source_url: string, category?: string|null }} item
 * @param {{ actualizar: Function, rutaAbsoluta: Function, rutaImagen: Function }} deps funciones de closet.service
 */
async function procesar(item, deps) {
  try {
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
    const recorte = fotos.length ? await recortarMejor(fotos) : null;
    const silueta = recorte ? await imagen.analizarSilueta(recorte.recorte.png) : null;
    const decision = decidir(texto, silueta);

    let imagePath = null;
    if (recorte) {
      imagePath = deps.rutaImagen(item);
      const destino = deps.rutaAbsoluta(imagePath);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, recorte.recorte.png);
    }
    const colorTexto = ropa.detectarColor(producto.color, producto.titulo, new URL(producto.url).pathname);
    const color = colorTexto?.hex ?? (recorte ? await imagen.colorDominante(recorte.recorte.png) : null);

    const avisos = [];
    if (producto.bloqueado) avisos.push('La tienda bloqueó la lectura automática: se analizó solo el link.');
    else if (!producto.imagenes?.length) avisos.push('No se encontraron fotos del producto.');
    else if (!recorte) avisos.push('Ninguna foto tenía fondo liso para recortar la prenda.');

    const categoriaUsuario = item.category ?? null;
    const categoria = categoriaUsuario ?? (decision.categoria ? CATEGORIA_ARMARIO[decision.categoria] : null);
    deps.actualizar(item.id, {
      status: categoria ? 'ready' : 'review',
      category: categoria,
      tipo: decision.tipo,
      nombre: producto.titulo || ropa.nombreDesdeUrl(producto.url) || 'Prenda',
      color,
      tienda: producto.tienda === 'generica' ? new URL(producto.url).hostname.replace(/^www\d?\./, '') : producto.tienda,
      precio: ropa.formatearPrecio(producto.precio, producto.moneda),
      image_path: imagePath,
      imagen_origen: recorte?.foto.url ?? null,
      error: null,
      analisis_json: JSON.stringify({
        confianza: decision.confianza,
        evidencias: decision.evidencias,
        avisos,
        metodoLectura: producto.metodo,
        metodoRecorte: recorte?.recorte.metodo ?? null,
        fotosEvaluadas: fotos.map((f) => ({ url: f.url, fuente: f.fuente, ...f.evaluacion })),
        silueta,
      }),
    });
  } catch (err) {
    deps.actualizar(item.id, { status: 'failed', error: err.statusCode && err.statusCode < 500 ? err.message : 'No se pudo procesar el link' });
  }
}

module.exports = { encolar, procesar, decidir, evaluarFotos, CATEGORIA_ARMARIO };
