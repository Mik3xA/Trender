const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');

const { db, generarId } = require('./db.service');
const cache = require('./cache.service');
const { errorOperacional } = require('./errores.service');

const ALGORITMO = 'HS256';
const SEGUNDOS_POR_DEFECTO = 7 * 24 * 60 * 60; // 7 días
const RONDAS_BCRYPT = Number(process.env.BCRYPT_ROUNDS) || 12;

/**
 * Secreto de firma. En producción es obligatorio definir JWT_SECRET; en
 * desarrollo se genera uno aleatorio por proceso (los tokens caducan al reiniciar).
 */
const SECRETO = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es obligatorio en producción');
  }
  console.warn('[Auth] JWT_SECRET no definido: usando un secreto temporal de desarrollo.');
  return crypto.randomBytes(48).toString('hex');
})();

const DURACION_SEGUNDOS = Number(process.env.JWT_EXPIRES_IN_SECONDS) || SEGUNDOS_POR_DEFECTO;

// Hash ficticio para que un email inexistente tarde lo mismo que uno real
// (evita enumerar cuentas midiendo el tiempo de respuesta).
const HASH_FICTICIO = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), RONDAS_BCRYPT);

// Hashes del prototipo anterior: "salt:derivada" con scrypt (16 bytes de salt, 64 de clave).
const HASH_SCRYPT_LEGADO = /^[0-9a-f]{32}:[0-9a-f]{128}$/;
const scrypt = promisify(crypto.scrypt);

const consultas = {
  insertarUsuario: db.prepare('INSERT INTO users (id, nombre, email, password_hash) VALUES (?, ?, ?, ?)'),
  insertarPerfil: db.prepare('INSERT INTO user_profiles (id, user_id) VALUES (?, ?)'),
  usuarioPorEmail: db.prepare('SELECT id, nombre, email, password_hash, created_at FROM users WHERE email = ?'),
  usuarioPorId: db.prepare('SELECT id, nombre, email, created_at FROM users WHERE id = ?'),
  actualizarHash: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  insertarSesion: db.prepare('INSERT INTO sessions (id, user_id, user_agent, expires_at) VALUES (?, ?, ?, ?)'),
  sesionActiva: db.prepare(`
    SELECT id, user_id FROM sessions
    WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ?
  `),
  revocarSesion: db.prepare(`
    UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL
  `),
  purgarSesiones: db.prepare(`
    DELETE FROM sessions WHERE user_id = ? AND (expires_at <= ? OR revoked_at IS NOT NULL)
  `),
};

function normalizarEmail(email) {
  return String(email).trim().toLowerCase();
}

/** "ana.maria@x.com" -> "Ana Maria": nombre por defecto si no se envía uno. */
function nombreDesdeEmail(email) {
  const base = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return (
    base
      .split(' ')
      .filter(Boolean)
      .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
      .join(' ') || 'Usuario Trender'
  );
}

function serializarUsuario(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre || nombreDesdeEmail(fila.email),
    email: fila.email,
    created_at: fila.created_at,
  };
}

/**
 * Compara la contraseña con el hash guardado. Acepta bcrypt y, por
 * compatibilidad, los hashes scrypt del prototipo anterior.
 * @returns {Promise<{ coincide: boolean, legado: boolean }>}
 */
async function verificarPassword(password, hash) {
  if (HASH_SCRYPT_LEGADO.test(hash)) {
    const [salt, esperado] = hash.split(':');
    const derivada = await scrypt(password, salt, 64);
    return { coincide: crypto.timingSafeEqual(Buffer.from(esperado, 'hex'), derivada), legado: true };
  }
  return { coincide: await bcrypt.compare(password, hash), legado: false };
}

/**
 * Crea una fila de sesión y firma el JWT que la referencia (claim `sid`).
 * @returns {{ token: string, expires_at: string, session_id: string }}
 */
function crearSesion(userId, userAgent) {
  const ahora = new Date();
  const expiraEn = new Date(ahora.getTime() + DURACION_SEGUNDOS * 1000);
  const sessionId = generarId();

  consultas.purgarSesiones.run(userId, ahora.toISOString());
  consultas.insertarSesion.run(sessionId, userId, userAgent?.slice(0, 255) ?? null, expiraEn.toISOString());

  const token = jwt.sign({ sid: sessionId }, SECRETO, {
    algorithm: ALGORITMO,
    subject: userId,
    expiresIn: DURACION_SEGUNDOS,
  });
  return { token, expires_at: expiraEn.toISOString(), session_id: sessionId };
}

/** Registra la cuenta y su perfil vacío de forma atómica, y abre sesión. */
async function registrar({ nombre, email, password, userAgent }) {
  const emailNormalizado = normalizarEmail(email);
  const nombreFinal = String(nombre ?? '').trim() || nombreDesdeEmail(emailNormalizado);
  const hash = await bcrypt.hash(password, RONDAS_BCRYPT);
  const userId = generarId();

  try {
    db.transaction(() => {
      consultas.insertarUsuario.run(userId, nombreFinal, emailNormalizado, hash);
      consultas.insertarPerfil.run(generarId(), userId);
    })();
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw errorOperacional(409, 'Ya existe una cuenta con ese email', 'EMAIL_EN_USO');
    }
    throw err;
  }

  const usuario = serializarUsuario(consultas.usuarioPorId.get(userId));
  return { user: usuario, ...crearSesion(userId, userAgent) };
}

/** Verifica credenciales. Mismo error (401) para email inexistente o contraseña errónea. */
async function iniciarSesion({ email, password, userAgent }) {
  const fila = consultas.usuarioPorEmail.get(normalizarEmail(email));
  const { coincide, legado } = await verificarPassword(password, fila?.password_hash ?? HASH_FICTICIO);
  if (!fila || !coincide) {
    throw errorOperacional(401, 'Email o contraseña incorrectos', 'CREDENCIALES_INVALIDAS');
  }
  if (legado) {
    // Migración transparente: el hash scrypt antiguo se reemplaza por bcrypt.
    consultas.actualizarHash.run(await bcrypt.hash(password, RONDAS_BCRYPT), fila.id);
  }
  return { user: serializarUsuario(fila), ...crearSesion(fila.id, userAgent) };
}

/**
 * Valida firma, caducidad y que la sesión siga activa en el servidor.
 * @returns {{ userId: string, sessionId: string }}
 */
function verificarToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, SECRETO, { algorithms: [ALGORITMO] });
  } catch {
    throw errorOperacional(401, 'Sesión inválida o expirada', 'TOKEN_INVALIDO');
  }
  if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
    throw errorOperacional(401, 'Sesión inválida o expirada', 'TOKEN_INVALIDO');
  }
  const sesion = consultas.sesionActiva.get(payload.sid, payload.sub, new Date().toISOString());
  if (!sesion) {
    throw errorOperacional(401, 'La sesión fue cerrada o expiró', 'SESION_REVOCADA');
  }
  return { userId: sesion.user_id, sessionId: sesion.id };
}

/** Logout: revoca la sesión en el servidor y limpia la caché temporal del usuario. */
function cerrarSesion({ userId, sessionId }) {
  const resultado = consultas.revocarSesion.run(new Date().toISOString(), sessionId, userId);
  cache.limpiarUsuario(userId);
  return { revoked: resultado.changes === 1 };
}

function obtenerUsuario(userId) {
  const fila = consultas.usuarioPorId.get(userId);
  if (!fila) throw errorOperacional(404, 'Usuario no encontrado');
  return serializarUsuario(fila);
}

module.exports = {
  registrar,
  iniciarSesion,
  verificarToken,
  cerrarSesion,
  obtenerUsuario,
  normalizarEmail,
};
