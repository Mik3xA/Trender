const fs = require('fs');
const path = require('path');

const { db, generarId } = require('./db.service');
const cache = require('./cache.service');
const { errorOperacional } = require('./errores.service');
const { normalizarUrlProducto } = require('./url.service');
const importacion = require('./importacion.service');

const CATEGORIAS = ['top', 'bottom', 'dress', 'shoes'];
const GENEROS = ['Femenino', 'Masculino'];
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'));
const PREFIJO_CACHE = 'closet:';
const COLUMNAS = `id, genero, source_url, image_path, category, tipo, nombre, color, tienda, precio,
  analisis_json, error, status, created_at, updated_at`;

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
  const { analisis_json: analisis, image_path: imagen, ...resto } = fila;
  return {
    ...resto,
    imagen_url: imagen ? `/media/${imagen}` : null,
    analisis: analisis ? JSON.parse(analisis) : null,
  };
}

const COLUMNAS_EDITABLES = ['status', 'category', 'tipo', 'nombre', 'color', 'tienda', 'precio', 'image_path', 'imagen_origen', 'analisis_json', 'error'];

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

/**
 * Registra la prenda en estado "processing" y encola su importación.
 * Responde de inmediato: el análisis (segundos) sigue en segundo plano.
 */
function importarDesdeLink(userId, { url, genero = 'Femenino', category = null }) {
  const sourceUrl = normalizarUrlProducto(url);
  const itemId = generarId();
  try {
    consultas.insertar.run(itemId, userId, genero, sourceUrl, category);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw errorOperacional(409, 'Esta prenda ya está en tu armario', 'PRENDA_DUPLICADA');
    }
    throw err;
  }
  cache.invalidar(userId, PREFIJO_CACHE);
  const item = { id: itemId, user_id: userId, source_url: sourceUrl, category };
  const terminado = importacion.encolar(() => importacion.procesar(item, { actualizar: actualizarInterno, rutaAbsoluta, rutaImagen }));
  return { prenda: obtenerPrenda(userId, itemId), terminado };
}

/** El usuario corrige o elige la categoría (y opcionalmente el tipo). */
function actualizarPrenda(userId, itemId, { category, tipo }) {
  const actual = obtenerPrenda(userId, itemId);
  if (actual.status === 'processing') throw errorOperacional(409, 'La prenda aún se está analizando', 'EN_PROCESO');
  actualizarInterno(itemId, {
    category,
    ...(tipo !== undefined ? { tipo } : {}),
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
  CATEGORIAS,
  GENEROS,
  UPLOADS_DIR,
  listarPrendas,
  obtenerPrenda,
  importarDesdeLink,
  actualizarPrenda,
  eliminarPrenda,
};
