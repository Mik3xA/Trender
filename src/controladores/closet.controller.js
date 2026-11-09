const closetService = require('../servicios/closet.service');

// Cada operación usa req.auth.userId (de la sesión), nunca un id enviado por el cliente.

async function listar(req, res, next) {
  try {
    const items = closetService.listarPrendas(req.auth.userId, { category: req.query.category });
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

/** POST /api/closet/add-from-link — registra la prenda como "pending" de recorte. */
async function agregarDesdeLink(req, res, next) {
  try {
    const { url, category } = req.body;
    const item = closetService.agregarDesdeLink(req.auth.userId, { url, category });
    res.status(201).json({ status: 'success', data: item });
  } catch (err) {
    next(err);
  }
}

async function actualizarCategoria(req, res, next) {
  try {
    const item = closetService.actualizarCategoria(req.auth.userId, req.params.id, req.body.category);
    res.status(200).json({ status: 'success', data: item });
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

module.exports = { listar, obtener, agregarDesdeLink, actualizarCategoria, eliminar };
