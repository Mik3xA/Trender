const fs = require('fs');
const path = require('path');

const imagen = require('./imagen.service');
const vision = require('./vision.service');
const ropa = require('./ropa.service');

/**
 * Análisis de las FOTOS de prendas subidas por el usuario (trabajo en segundo plano):
 *
 *   calidad de la foto  ->  quitar fondo (tolerante a fondos caseros)
 *     ->  análisis visual  ->  combinar con el nombre / respuestas del usuario  ->  guardar
 *
 * El endpoint responde 202 al instante con la prenda en estado "processing";
 * el frontend consulta GET /api/closet/:id hasta ver "ready", "review" o "failed".
 */

const CONCURRENCIA = 2;
const CATEGORIA_ARMARIO = { Torso: 'top', Piernas: 'bottom', Vestido: 'dress', Calzado: 'shoes', Outfit: 'outfit' };
const TIPO_POR_DEFECTO = { Torso: 'camiseta', Piernas: 'pantalon', Vestido: 'vestido', Calzado: 'tenis' };
const NOMBRE_FUENTE = { categoria: 'categoría de la tienda', titulo: 'título del producto', url: 'palabras del link', descripcion: 'descripción', nombre: 'nombre que escribiste' };

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
    let recorte;
    try {
      recorte = await imagen.quitarFondo(buffer, { tolerante: true });
    } catch (err) {
      if (err.code !== 'FONDO_NO_LISO' && err.code !== 'SIN_PRENDA') throw err;
      // Sin recorte (fondo muy parecido a la prenda, outfit puesto en una persona...):
      // se guarda la foto completa; la IA de la prueba sabe sacar la prenda de ella.
      recorte = { png: await imagen.fotoCompleta(buffer), metodo: 'sin-recorte' };
    }
    const visual = recorte.metodo === 'sin-recorte' ? null : await vision.analizarPrenda(recorte.png);
    const texto = nombre ? ropa.clasificar({ titulo: nombre }) : { categoria: null, tipo: null, confianza: 'ninguna', fuentes: [] };
    texto.fuentes = (texto.fuentes ?? []).map((f) => (f === 'titulo' ? 'nombre' : f));
    const decision = decidir(texto, visual);
    if (item.tipo === 'outfit') {
      decision.evidencias.unshift('lo indicaste tú: outfit completo');
      Object.assign(decision, { categoria: 'Outfit', tipo: 'outfit', confianza: 'alta' });
    } else if (item.tipo) {
      // Respuesta del usuario antes de subir ("es una sudadera"): manda sobre todo lo demás.
      const categoriaUsuario = Object.entries(CATEGORIA_ARMARIO).find(([, c]) => c === item.category)?.[0];
      decision.evidencias.unshift(`lo indicaste tú: ${item.tipo}`);
      Object.assign(decision, { categoria: categoriaUsuario ?? decision.categoria, tipo: item.tipo, confianza: 'alta' });
    }

    const avisos = [];
    if (calidad.fraccionPiel > 0.15) avisos.push('Se ve piel en la foto: el resultado es mejor con la prenda sola, extendida o en gancho.');
    if (Math.min(calidad.ancho, calidad.alto) < 400) avisos.push('La foto es pequeña: con más resolución la prenda se verá más nítida.');
    if (recorte.metodo === 'recorte-tolerante') avisos.push('El fondo no era liso: revisa que el recorte haya quedado bien.');
    if (recorte.metodo === 'sin-recorte') avisos.push('No pudimos separar la prenda del fondo: se usará la foto completa. Confirma qué prenda es.');
    if (decision.confianza === 'baja') avisos.push('No estamos seguros del tipo de prenda: confírmalo en el armario.');
    // Una foto con varias prendas (o puesta en una persona) puede ser un outfit completo: se pregunta.
    const posibleOutfit = decision.tipo !== 'outfit' && Boolean(visual?.detalle?.posibleOutfit || calidad.fraccionPiel > 0.12);
    if (posibleOutfit) avisos.push('Parece un outfit completo: elige si quieres usar todo o solo una parte.');

    const imagePath = guardarRecorte(item, recorte.png, deps);
    const categoriaUsuario = item.category ?? null;
    const categoria = categoriaUsuario ?? (decision.categoria && decision.confianza !== 'baja' ? CATEGORIA_ARMARIO[decision.categoria] : null);
    deps.actualizar(item.id, {
      status: categoria ? 'ready' : 'review',
      category: categoria ?? (decision.categoria ? CATEGORIA_ARMARIO[decision.categoria] : null),
      tipo: decision.tipo,
      nombre: nombre || (decision.tipo === 'outfit' ? 'Outfit completo' : visual?.nombreSugerido) || 'Prenda',
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
        posibleOutfit,
      }),
      ...(decision.tipo === 'outfit' ? { ajustes_json: JSON.stringify({ usar: ['top', 'bottom', 'shoes'] }) } : {}),
    });
  } catch (err) {
    deps.actualizar(item.id, {
      status: 'failed',
      error: err.statusCode && err.statusCode < 500 ? err.message : 'No se pudo analizar la foto',
    });
  }
}

module.exports = { encolar, procesarFoto, decidir, CATEGORIA_ARMARIO };
