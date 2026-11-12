const fs = require('fs');
const path = require('path');

const { errorOperacional } = require('./errores.service');

/**
 * Archivos privados (fotos de la persona y pruebas generadas). NO se publican
 * en /media: solo se sirven por endpoints que exigen la sesión del dueño.
 */
const PRIVADO_DIR = path.resolve(process.env.PRIVATE_DIR || path.join(__dirname, '../../privado'));

function rutaPrivada(rutaRelativa) {
  const absoluta = path.resolve(PRIVADO_DIR, rutaRelativa);
  if (!absoluta.startsWith(PRIVADO_DIR + path.sep)) throw errorOperacional(400, 'Ruta inválida');
  return absoluta;
}

function guardar(rutaRelativa, buffer) {
  const destino = rutaPrivada(rutaRelativa);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, buffer);
}

function leer(rutaRelativa) {
  try {
    return fs.readFileSync(rutaPrivada(rutaRelativa));
  } catch {
    throw errorOperacional(404, 'Imagen no encontrada');
  }
}

function borrar(rutaRelativa) {
  if (rutaRelativa) fs.rmSync(rutaPrivada(rutaRelativa), { force: true });
}

module.exports = { PRIVADO_DIR, rutaPrivada, guardar, leer, borrar };
