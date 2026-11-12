const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sharp = require('sharp');

const { db, generarId } = require('./db.service');
const cache = require('./cache.service');
const { errorOperacional } = require('./errores.service');
const importacion = require('./importacion.service');

const CATEGORIAS = ['top', 'bottom', 'dress', 'shoes', 'outfit'];
/** Partes que se pueden usar de un outfit completo. */
const PARTES_OUTFIT = ['top', 'bottom', 'dress', 'shoes'];
/** Tipos concretos de cada categoría (los que el avatar 3D sabe vestir). */
const TIPOS_POR_CATEGORIA = {
  top: ['camiseta', 'camisa', 'blusa', 'top', 'sueter', 'sudadera', 'chamarra', 'blazer', 'abrigo'],
  bottom: ['pantalon', 'jeans', 'jogger', 'leggings', 'short', 'falda'],
  dress: ['vestido'],
  shoes: ['tenis', 'zapatos', 'botas', 'sandalias'],
  outfit: ['outfit'],
};
const TIPOS = Object.values(TIPOS_POR_CATEGORIA).flat();
const categoriaDeTipo = (tipo) => Object.keys(TIPOS_POR_CATEGORIA).find((c) => TIPOS_POR_CATEGORIA[c].includes(tipo)) ?? null;
/** Respuestas válidas del cuestionario de la prenda. */
const OPCIONES_AJUSTES = {
  ajuste: ['ajustado', 'regular', 'holgado'],
  largo: ['corto', 'normal', 'largo'],
  manga: ['sin', 'corta', 'tres-cuartos', 'larga'],
  // Modelo 3D: color y tejido limpios, o la foto proyectada.
  aspecto: ['tela', 'foto'],
};
const GENEROS = ['Femenino', 'Masculino'];
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'));
const PREFIJO_CACHE = 'closet:';
const COLUMNAS = `id, genero, source_url, image_path, category, tipo, nombre, color, tienda, precio,
  analisis_json, ajustes_json, error, status, created_at, updated_at`;

// TODAS las consultas incluyen `user_id = ?`: un usuario nunca ve ni modifica
// prendas de otro. Un id ajeno se trata igual que uno inexistente (404).
const consultas = {
  listar: db.prepare(`SELECT ${COLUMNAS} FROM closet_items WHERE user_id = ? ORDER BY created_at DESC, id`),
  obtener: db.prepare(`SELECT ${COLUMNAS} FROM closet_items WHERE id = ? AND user_id = ?`),
  insertar: db.prepare(`
    INSERT INTO closet_items (id, user_id, genero, source_url, category, status)
    VALUES (?, ?, ?, ?, ?, 'processing')
  `),
  eliminar: db.prepare('DELETE FROM closet_items WHERE id = ? AND user_id = ?'),
  propietario: db.prepare('SELECT user_id FROM closet_items WHERE id = ?'),
};

// Importaciones que quedaron a medias si el servidor se reinició.
db.prepare(`UPDATE closet_items SET status = 'failed', error = 'Importación interrumpida: vuelve a intentarlo' WHERE status = 'processing'`).run();

/** Ruta (relativa a UPLOADS_DIR) del recorte. Solo con ids generados por el servidor. */
function rutaImagen(item) {
  return path.posix.join('closet', item.user_id, `${item.id}.png`);
}

function rutaAbsoluta(rutaRelativa) {
  const absoluta = path.resolve(UPLOADS_DIR, rutaRelativa);
  if (!absoluta.startsWith(UPLOADS_DIR + path.sep)) throw errorOperacional(400, 'Ruta de imagen inválida');
  return absoluta;
}

/** Forma pública de una prenda (JSON para Angular y Flutter). */
function serializar(fila) {
  const { analisis_json: analisis, ajustes_json: ajustes, image_path: imagen, source_url: origen, ...resto } = fila;
  return {
    ...resto,
    // Las fotos se identifican por su huella; no hace falta exponerla.
    source_url: origen?.startsWith('foto:') ? null : origen,
    imagen_url: imagen ? `/media/${imagen}` : null,
    analisis: analisis ? JSON.parse(analisis) : null,
    ajustes: ajustes ? JSON.parse(ajustes) : null,
  };
}

const COLUMNAS_EDITABLES = ['status', 'category', 'tipo', 'nombre', 'color', 'tienda', 'precio', 'image_path', 'imagen_origen', 'analisis_json', 'ajustes_json', 'error'];

/** Actualización interna (la usa el trabajo de importación). */
function actualizarInterno(itemId, cambios) {
  const claves = Object.keys(cambios).filter((c) => COLUMNAS_EDITABLES.includes(c));
  if (!claves.length) return;
  const asignaciones = claves.map((c) => `${c} = @${c}`).join(', ');
  db.prepare(`UPDATE closet_items SET ${asignaciones}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = @id`).run({
    ...Object.fromEntries(claves.map((c) => [c, cambios[c]])),
    id: itemId,
  });
  const fila = consultas.propietario.get(itemId);
  if (fila) cache.invalidar(fila.user_id, PREFIJO_CACHE);
}

function listarPrendas(userId, { genero, category } = {}) {
  const clave = `${PREFIJO_CACHE}${genero ?? 'todos'}:${category ?? 'todas'}`;
  const enCache = cache.obtener(userId, clave);
  if (enCache) return enCache;
  const filas = consultas
    .listar.all(userId)
    .filter((f) => (!genero || f.genero === genero) && (!category || f.category === category))
    .map(serializar);
  // Mientras haya importaciones en curso no se cachea (el estado cambia en segundos).
  if (filas.some((f) => f.status === 'processing')) return filas;
  return cache.guardar(userId, clave, filas);
}

function obtenerPrenda(userId, itemId) {
  const fila = consultas.obtener.get(itemId, userId);
  if (!fila) throw errorOperacional(404, 'Prenda no encontrada');
  return serializar(fila);
}

const FORMATOS_FOTO = new Set(['jpeg', 'png', 'webp', 'avif', 'gif', 'tiff', 'heif']);
const LADO_MINIMO_FOTO = 120;

/** Comprueba que el archivo es una foto legible y de tamaño suficiente. */
async function validarFoto(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { failOn: 'none' }).metadata();
  } catch {
    throw errorOperacional(415, 'El archivo no es una imagen válida', 'IMAGEN_INVALIDA');
  }
  if (!FORMATOS_FOTO.has(meta.format)) {
    throw errorOperacional(415, 'Formato no admitido: usa JPG, PNG, WEBP o AVIF', 'IMAGEN_INVALIDA');
  }
  if ((meta.width ?? 0) < LADO_MINIMO_FOTO || (meta.height ?? 0) < LADO_MINIMO_FOTO) {
    throw errorOperacional(422, `La foto es demasiado pequeña (mínimo ${LADO_MINIMO_FOTO} px por lado)`, 'IMAGEN_PEQUENA');
  }
  if (meta.format === 'heif') {
    try {
      await sharp(buffer).resize(8).toBuffer();
    } catch {
      throw errorOperacional(415, 'No se pudo leer la foto HEIC: expórtala como JPG o PNG', 'IMAGEN_INVALIDA');
    }
  }

}

/**
 * Registra una FOTO de prenda subida por el usuario y encola su análisis
 * (recorte, tipo de prenda, color, estampado...). La misma foto dos veces en
 * el mismo apartado es un duplicado (409).
 * @param {string} userId
 * @param {{ buffer: Buffer, genero?: string, nombre?: string|null, category?: string|null }} datos
 */
async function subirFoto(userId, { buffer, genero = 'Femenino', nombre = null, category = null, tipo = null }) {
  await validarFoto(buffer);
  // Si el usuario dijo qué es ("es una sudadera"), su respuesta manda sobre el análisis.
  if (tipo) category = categoriaDeTipo(tipo);
  // El origen de una foto es su huella: identifica duplicados sin guardar el original.
  const huella = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 24);
  const sourceUrl = `foto:${genero}:${huella}`;
  const itemId = generarId();
  try {
    consultas.insertar.run(itemId, userId, genero, sourceUrl, category);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw errorOperacional(409, 'Esta foto ya está en tu armario', 'PRENDA_DUPLICADA');
    }
    throw err;
  }
  if (nombre) actualizarInterno(itemId, { nombre });
  cache.invalidar(userId, PREFIJO_CACHE);
  const item = { id: itemId, user_id: userId, source_url: sourceUrl, category, tipo };
  const terminado = importacion.encolar(() =>
    importacion.procesarFoto(item, buffer, { nombre }, { actualizar: actualizarInterno, rutaAbsoluta, rutaImagen })
  );
  return { prenda: obtenerPrenda(userId, itemId), terminado };
}

/**
 * Añade (o cambia) la foto de una prenda que ya existe; por ejemplo, una
 * importada por link cuya tienda no dejó descargar la foto. Se conservan el
 * nombre, la tienda y el precio; la categoría la decide de nuevo la foto
 * junto con el nombre.
 */
async function agregarFoto(userId, itemId, buffer) {
  const actual = obtenerPrenda(userId, itemId);
  if (actual.status === 'processing') throw errorOperacional(409, 'La prenda aún se está analizando', 'EN_PROCESO');
  await validarFoto(buffer);
  const fila = consultas.obtener.get(itemId, userId);
  if (fila.image_path) fs.rmSync(rutaAbsoluta(fila.image_path), { force: true });
  actualizarInterno(itemId, { status: 'processing', error: null });
  const item = { id: itemId, user_id: userId, source_url: fila.source_url, category: null };
  const terminado = importacion.encolar(() =>
    importacion.procesarFoto(
      item,
      buffer,
      { nombre: actual.nombre, origen: 'foto añadida', conservar: { tienda: actual.tienda, precio: actual.precio } },
      { actualizar: actualizarInterno, rutaAbsoluta, rutaImagen }
    )
  );
  return { prenda: obtenerPrenda(userId, itemId), terminado };
}

/** El usuario corrige o elige la categoría (y opcionalmente el tipo). */
function actualizarPrenda(userId, itemId, { category, tipo, ajustes }) {
  const actual = obtenerPrenda(userId, itemId);
  if (actual.status === 'processing') throw errorOperacional(409, 'La prenda aún se está analizando', 'EN_PROCESO');
  if (tipo !== undefined && !TIPOS_POR_CATEGORIA[category].includes(tipo)) {
    throw errorOperacional(400, `El tipo "${tipo}" no corresponde a la categoría ${category}`, 'TIPO_INVALIDO');
  }
  actualizarInterno(itemId, {
    category,
    ...(tipo !== undefined ? { tipo } : {}),
    ...(ajustes !== undefined ? { ajustes_json: ajustes === null ? null : JSON.stringify({ ...(actual.ajustes ?? {}), ...ajustes }) } : {}),
    ...(actual.status === 'review' ? { status: 'ready' } : {}),
  });
  return obtenerPrenda(userId, itemId);
}

function eliminarPrenda(userId, itemId) {
  const fila = consultas.obtener.get(itemId, userId);
  if (!fila) throw errorOperacional(404, 'Prenda no encontrada');
  consultas.eliminar.run(itemId, userId);
  if (fila.image_path) fs.rmSync(rutaAbsoluta(fila.image_path), { force: true });
  cache.invalidar(userId, PREFIJO_CACHE);
  return { id: itemId, deleted: true };
}

module.exports = {
  validarFoto,
  rutaAbsoluta,
  CATEGORIAS,
  TIPOS,
  TIPOS_POR_CATEGORIA,
  OPCIONES_AJUSTES,
  PARTES_OUTFIT,
  categoriaDeTipo,
  GENEROS,
  UPLOADS_DIR,
  listarPrendas,
  obtenerPrenda,
  subirFoto,
  agregarFoto,
  actualizarPrenda,
  eliminarPrenda,
};
