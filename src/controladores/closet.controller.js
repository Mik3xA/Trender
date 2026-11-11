const closetService = require('../servicios/closet.service');

// Cada operación usa req.auth.userId (de la sesión), nunca un id enviado por el cliente.

async function listar(req, res, next) {
  try {
    const { genero, category } = req.query;
    const items = closetService.listarPrendas(req.auth.userId, { genero, category });
    res.status(200).json({ status: 'success', data: { items, count: items.length } });
  } catch (err) {
    next(err);
  }
}

async function obtener(req, res, next) {
  try {
    res.status(200).json({ status: 'success', data: closetService.obtenerPrenda(req.auth.userId, req.params.id) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/closet/importar (y su alias /add-from-link).
 * 202 Accepted: la prenda queda "processing" y se analiza en segundo plano;
 * el cliente consulta GET /api/closet/:id hasta "ready", "review" o "failed".
 */
async function importar(req, res, next) {
  try {
    const { url, genero, category } = req.body;
    const { prenda } = closetService.importarDesdeLink(req.auth.userId, { url, genero, category });
    res.status(202).location(`/api/closet/${prenda.id}`).json({ status: 'success', data: prenda });
  } catch (err) {
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const { category, tipo } = req.body;
    res.status(200).json({ status: 'success', data: closetService.actualizarPrenda(req.auth.userId, req.params.id, { category, tipo }) });
  } catch (err) {
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    res.status(200).json({ status: 'success', data: closetService.eliminarPrenda(req.auth.userId, req.params.id) });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, obtener, importar, actualizar, eliminar };
