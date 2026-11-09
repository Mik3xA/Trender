const perfilService = require('../servicios/perfil.service');

async function obtener(req, res, next) {
  try {
    res.status(200).json({ status: 'success', data: perfilService.obtenerPerfil(req.auth.userId) });
  } catch (err) {
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const { altura, pecho, cintura, cadera, avatar_config } = req.body;
    const perfil = perfilService.actualizarPerfil(req.auth.userId, { altura, pecho, cintura, cadera, avatar_config });
    res.status(200).json({ status: 'success', data: perfil });
  } catch (err) {
    next(err);
  }
}

module.exports = { obtener, actualizar };
