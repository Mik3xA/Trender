const fs = require('fs');
const path = require('path');

const { db, generarId } = require('./db.service');
const cache = require('./cache.service');
const { errorOperacional } = require('./errores.service');
const { normalizarUrlProducto } = require('./url.service');
const { categoriaArmario } = require('./ropa.service');

const CATEGORIAS = ['top', 'bottom', 'shoes'];
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'));
const PREFIJO_CACHE = 'closet:';

// TODAS las consultas incluyen `user_id = ?`: un usuario nunca ve ni modifica
// prendas de otro. Un id ajeno se trata igual que uno inexistente (404).
const consultas = {
  listar: db.prepare(`
    SELECT id, source_url, image_path, category, status, created_at, updated_at
    FROM closet_items WHERE user_id = ? ORDER BY created_at DESC, id
  `),
  listarPorCategoria: db.prepare(`
    SELECT id, source_url, image_path, category, status, created_at, updated_at
    FROM closet_items WHERE user_id = ? AND category = ? ORDER BY created_at DESC, id
  `),
  obtener: db.prepare(`
    SELECT id, source_url, image_path, category, status, created_at, updated_at
    FROM closet_items WHERE id = ? AND user_id = ?
  `),
  insertar: db.prepare(`
    INSERT INTO closet_items (id, user_id, source_url, image_path, category, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `),
  actualizarCategoria: db.prepare(`
    UPDATE closet_items SET category = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND user_id = ?
  `),
  eliminar: db.prepare('DELETE FROM closet_items WHERE id = ? AND user_id = ?'),
};

/**
 * Ruta (relativa a UPLOADS_DIR) reservada para la imagen recortada.
 * Se construye solo con ids generados por el servidor, nunca con datos del cliente.
 */
function rutaImagenReservada(userId, itemId) {
  return path.posix.join('closet', userId, `${itemId}.png`);
}

function rutaAbsoluta(rutaRelativa) {
  const absoluta = path.resolve(UPLOADS_DIR, rutaRelativa);
  if (!absoluta.startsWith(UPLOADS_DIR + path.sep)) {
    throw errorOperacional(400, 'Ruta de imagen inválida');
  }
  return absoluta;
}

function listarPrendas(userId, { category } = {}) {
  const clave = `${PREFIJO_CACHE}${category ?? 'all'}`;
  const enCache = cache.obtener(userId, clave);
  if (enCache) return enCache;
  const filas = category ? consultas.listarPorCategoria.all(userId, category) : consultas.listar.all(userId);
  return cache.guardar(userId, clave, filas);
}

function obtenerPrenda(userId, itemId) {
  const fila = consultas.obtener.get(itemId, userId);
  if (!fila) throw errorOperacional(404, 'Prenda no encontrada');
  return fila;
}

/**
 * Ingesta por link: valida la URL, crea el registro "pending" vinculado al
 * usuario y prepara la carpeta donde el servicio de recorte dejará la imagen.
 * Si no se indica categoría, se deduce de las palabras del link.
 */
function agregarDesdeLink(userId, { url, category }) {
  const sourceUrl = normalizarUrlProducto(url);
  category = category ?? categoriaArmario(sourceUrl);
  const itemId = generarId();
  const imagePath = rutaImagenReservada(userId, itemId);

  fs.mkdirSync(path.dirname(rutaAbsoluta(imagePath)), { recursive: true });

  try {
    consultas.insertar.run(itemId, userId, sourceUrl, imagePath, category);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw errorOperacional(409, 'Esta prenda ya está en tu armario', 'PRENDA_DUPLICADA');
    }
    throw err;
  }
  cache.invalidar(userId, PREFIJO_CACHE);
  return obtenerPrenda(userId, itemId);
}

function actualizarCategoria(userId, itemId, category) {
  const { changes } = consultas.actualizarCategoria.run(category, itemId, userId);
  if (changes === 0) throw errorOperacional(404, 'Prenda no encontrada');
  cache.invalidar(userId, PREFIJO_CACHE);
  return obtenerPrenda(userId, itemId);
}

function eliminarPrenda(userId, itemId) {
  const prenda = obtenerPrenda(userId, itemId);
  consultas.eliminar.run(itemId, userId);
  if (prenda.image_path) {
    fs.rmSync(rutaAbsoluta(prenda.image_path), { force: true });
  }
  cache.invalidar(userId, PREFIJO_CACHE);
  return { id: itemId, deleted: true };
}

module.exports = {
  CATEGORIAS,
  UPLOADS_DIR,
  listarPrendas,
  obtenerPrenda,
  agregarDesdeLink,
  actualizarCategoria,
  eliminarPrenda,
};
