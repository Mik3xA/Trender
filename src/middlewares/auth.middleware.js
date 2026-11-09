const { verificarToken } = require('../servicios/auth.service');
const { errorOperacional } = require('../servicios/errores.service');

/**
 * Exige `Authorization: Bearer <jwt>` con una sesión activa en el servidor.
 * Deja en `req.auth` el { userId, sessionId } que los controladores usan para
 * filtrar TODAS las consultas por el usuario de la sesión.
 */
function requerirAuth(req, res, next) {
  try {
    const cabecera = req.get('authorization') || '';
    const [esquema, token] = cabecera.split(' ');
    if (esquema !== 'Bearer' || !token) {
      throw errorOperacional(401, 'Autenticación requerida', 'SIN_TOKEN');
    }
    req.auth = verificarToken(token);
    // Las respuestas autenticadas nunca deben quedar en cachés compartidas.
    res.set('Cache-Control', 'no-store');
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requerirAuth };
