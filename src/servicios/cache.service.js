/**
 * Caché temporal en memoria, particionada por usuario.
 *
 * Cada usuario tiene su propio espacio de claves, de modo que nunca se
 * comparten datos entre cuentas y el logout puede borrar todo lo del usuario
 * de una vez (limpiarUsuario).
 */
const TTL_POR_DEFECTO_MS = 60 * 1000;

/** @type {Map<string, Map<string, { valor: unknown, expira: number }>>} */
const almacen = new Map();

function obtener(userId, clave) {
  const espacio = almacen.get(userId);
  const entrada = espacio?.get(clave);
  if (!entrada) return undefined;
  if (entrada.expira <= Date.now()) {
    espacio.delete(clave);
    return undefined;
  }
  return entrada.valor;
}

function guardar(userId, clave, valor, ttlMs = TTL_POR_DEFECTO_MS) {
  if (!almacen.has(userId)) almacen.set(userId, new Map());
  almacen.get(userId).set(clave, { valor, expira: Date.now() + ttlMs });
  return valor;
}

/** Invalida las claves del usuario que empiezan por `prefijo`. */
function invalidar(userId, prefijo = '') {
  const espacio = almacen.get(userId);
  if (!espacio) return;
  for (const clave of espacio.keys()) {
    if (clave.startsWith(prefijo)) espacio.delete(clave);
  }
}

/** Borra toda la caché del usuario (se usa en el logout). */
function limpiarUsuario(userId) {
  almacen.delete(userId);
}

function tamanoUsuario(userId) {
  return almacen.get(userId)?.size ?? 0;
}

module.exports = { obtener, guardar, invalidar, limpiarUsuario, tamanoUsuario };
