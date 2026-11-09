/**
 * Errores operacionales: llevan `statusCode` para que el manejador central
 * (error.controller.js) responda con ese código en lugar de 500.
 */
function errorOperacional(statusCode, message, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  return err;
}

module.exports = { errorOperacional };
