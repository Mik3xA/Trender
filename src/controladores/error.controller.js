function errorHandler(err, req, res, next) {
  // `status` lo ponen los errores de body-parser (JSON mal formado = 400).
  const statusCode = err.statusCode || err.status || 500;

  console.error('[Error Handler]', statusCode >= 500 ? err : `${statusCode} ${err.message}`);

  const message = statusCode >= 500 ? 'Internal Server Error' : err.message;

  const response = { status: 'error', error: message };

  if (statusCode < 500 && typeof err.code === 'string' && /^[A-Z_]+$/.test(err.code)) {
    response.code = err.code;
  }

  if (err.errors && Array.isArray(err.errors)) {
    response.errors = err.errors;
  }

  if (statusCode >= 500 && process.env.NODE_ENV !== 'production' && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = errorHandler;
