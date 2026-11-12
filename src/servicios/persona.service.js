const crypto = require('crypto');
const path = require('path');
const sharp = require('sharp');

const { db, generarId } = require('./db.service');
const { errorOperacional } = require('./errores.service');
const { validarFoto } = require('./closet.service');
const privado = require('./privado.service');

/**
 * Fotos de la persona: la base sobre la que la IA "viste" las prendas.
 * Se guardan normalizadas (orientación EXIF aplicada, sin metadatos como el
 * GPS, 1536 px como máximo) y en almacenamiento privado.
 */

const LADO_MAXIMO = 1536;
const MAX_FOTOS = 12;

const consultas = {
  listar: db.prepare('SELECT id, image_path, ancho, alto, created_at FROM fotos_persona WHERE user_id = ? ORDER BY created_at DESC, id'),
  obtener: db.prepare('SELECT id, image_path, ancho, alto, created_at FROM fotos_persona WHERE id = ? AND user_id = ?'),
  contar: db.prepare('SELECT COUNT(*) FROM fotos_persona WHERE user_id = ?').pluck(),
  insertar: db.prepare('INSERT INTO fotos_persona (id, user_id, image_path, ancho, alto, huella) VALUES (?, ?, ?, ?, ?, ?)'),
  eliminar: db.prepare('DELETE FROM fotos_persona WHERE id = ? AND user_id = ?'),
};

function serializar(fila) {
  return { id: fila.id, ancho: fila.ancho, alto: fila.alto, created_at: fila.created_at, imagen_url: `/api/persona/${fila.id}/imagen` };
}

async function subirFoto(userId, buffer) {
  await validarFoto(buffer);
  if (consultas.contar.get(userId) >= MAX_FOTOS) {
    throw errorOperacional(409, `Puedes guardar hasta ${MAX_FOTOS} fotos tuyas: borra alguna para subir otra`, 'LIMITE_FOTOS');
  }
  const { data, info } = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(LADO_MAXIMO, LADO_MAXIMO, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const huella = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 24);
  const id = generarId();
  const imagePath = path.posix.join('personas', userId, `${id}.jpg`);
  try {
    consultas.insertar.run(id, userId, imagePath, info.width, info.height, huella);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw errorOperacional(409, 'Esta foto ya la subiste', 'FOTO_DUPLICADA');
    throw err;
  }
  privado.guardar(imagePath, data);
  return serializar(consultas.obtener.get(id, userId));
}

function listar(userId) {
  return consultas.listar.all(userId).map(serializar);
}

function filaPropia(userId, id) {
  const fila = consultas.obtener.get(id, userId);
  if (!fila) throw errorOperacional(404, 'Foto no encontrada');
  return fila;
}

function leerImagen(userId, id) {
  return privado.leer(filaPropia(userId, id).image_path);
}

function eliminar(userId, id) {
  const fila = filaPropia(userId, id);
  consultas.eliminar.run(id, userId);
  privado.borrar(fila.image_path);
  return { id, deleted: true };
}

module.exports = { subirFoto, listar, leerImagen, eliminar, filaPropia, MAX_FOTOS };
