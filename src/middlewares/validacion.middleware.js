const { validationResult } = require('express-validator');

/**
 * Corta la petición con 400 + lista de errores si falló algún validador de
 * express-validator. El controlador no llega a ejecutarse.
 */
function manejarValidacion(req, res, next) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    const err = new Error('Validación fallida');
    err.statusCode = 400;
    err.errors = errores.array().map((e) => ({ field: e.path, message: e.msg }));
    return next(err);
  }
  next();
}

module.exports = { manejarValidacion };
