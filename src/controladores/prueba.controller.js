const pruebaService = require('../servicios/prueba.service');

async function estado(req, res, next) {
  try {
    res.status(200).json({ status: 'success', data: pruebaService.estado() });
  } catch (err) {
    next(err);
  }
}

/** POST /api/pruebas — 202: la imagen se genera en segundo plano. */
async function crear(req, res, next) {
  try {
    const { personaId, prendas } = req.body;
    const { prueba } = pruebaService.crear(req.auth.userId, { personaId, prendas });
    res.status(202).location(`/api/pruebas/${prueba.id}`).json({ status: 'success', data: prueba });
  } catch (err) {
    next(err);
  }
}

async function listar(req, res, next) {
  try {
    const items = pruebaService.listar(req.auth.userId);
    res.status(200).json({ status: 'success', data: { items, count: items.length } });
  } catch (err) {
    next(err);
  }
}

async function obtener(req, res, next) {
  try {
    res.status(200).json({ status: 'success', data: pruebaService.obtener(req.auth.userId, req.params.id) });
  } catch (err) {
    next(err);
  }
}

async function imagen(req, res, next) {
  try {
    const buffer = pruebaService.leerImagen(req.auth.userId, req.params.id);
    res.status(200).type('image/jpeg').set('Cache-Control', 'private, max-age=86400').send(buffer);
  } catch (err) {
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    res.status(200).json({ status: 'success', data: pruebaService.eliminar(req.auth.userId, req.params.id) });
  } catch (err) {
    next(err);
  }
}

module.exports = { estado, crear, listar, obtener, imagen, eliminar };
