const { validationResult } = require('express-validator');

function manejarValidacion(req, res, next) {
  const errores = validationResult(req);

  if (!errores.isEmpty()) {
    const error = new Error('Validación fallida');
    error.statusCode = 400;
    error.errors = errores.array().map((entrada) => ({
      field: entrada.path,
      message: entrada.msg
    }));
    return next(error);
  }

  return next();
}

module.exports = manejarValidacion;
