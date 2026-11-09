const { db } = require('./db.service');
const { errorOperacional } = require('./errores.service');

const CAMPOS_MEDIDA = ['altura', 'pecho', 'cintura', 'cadera'];
const MAX_AVATAR_CONFIG_BYTES = 16 * 1024;

const consultas = {
  porUsuario: db.prepare(`
    SELECT altura, pecho, cintura, cadera, avatar_config_json, updated_at
    FROM user_profiles WHERE user_id = ?
  `),
};

function serializar(fila) {
  return {
    altura: fila.altura,
    pecho: fila.pecho,
    cintura: fila.cintura,
    cadera: fila.cadera,
    avatar_config: JSON.parse(fila.avatar_config_json),
    updated_at: fila.updated_at,
  };
}

/** Perfil del usuario autenticado (siempre filtrado por su user_id). */
function obtenerPerfil(userId) {
  const fila = consultas.porUsuario.get(userId);
  if (!fila) throw errorOperacional(404, 'Perfil no encontrado');
  return serializar(fila);
}

/**
 * Actualiza solo los campos enviados. `null` borra una medida.
 * @param {string} userId
 * @param {{ altura?: number|null, pecho?: number|null, cintura?: number|null, cadera?: number|null, avatar_config?: object }} cambios
 */
function actualizarPerfil(userId, cambios) {
  const asignaciones = [];
  const valores = [];

  for (const campo of CAMPOS_MEDIDA) {
    if (cambios[campo] !== undefined) {
      asignaciones.push(`${campo} = ?`);
      valores.push(cambios[campo] === null ? null : Number(cambios[campo]));
    }
  }
  if (cambios.avatar_config !== undefined) {
    const json = JSON.stringify(cambios.avatar_config);
    if (Buffer.byteLength(json) > MAX_AVATAR_CONFIG_BYTES) {
      throw errorOperacional(413, 'avatar_config supera 16 KB');
    }
    asignaciones.push('avatar_config_json = ?');
    valores.push(json);
  }

  if (asignaciones.length) {
    asignaciones.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`);
    // Los nombres de columna vienen de la lista blanca CAMPOS_MEDIDA, nunca del cliente.
    db.prepare(`UPDATE user_profiles SET ${asignaciones.join(', ')} WHERE user_id = ?`).run(...valores, userId);
  }
  return obtenerPerfil(userId);
}

module.exports = { obtenerPerfil, actualizarPerfil, CAMPOS_MEDIDA };
