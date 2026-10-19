const db = require('../servicios/db.service');

async function guardarMedidas(req, res, next) {
  try {
    const userId = req.usuario.id;
    const { estatura, peso, complexion, genero } = req.body;

    if (!estatura || !peso || !complexion || !genero) {
      return res.status(400).json({ status: 'error', message: 'Todos los campos son requeridos' });
    }

    const medidas = db.guardarMedidas({ userId, estatura, peso, complexion, genero });
    return res.status(200).json({ status: 'success', medidas });
  } catch (error) {
    return next(error);
  }
}

async function obtenerMedidas(req, res, next) {
  try {
    const userId = req.usuario.id;
    const medidas = db.obtenerMedidas(userId);
    return res.status(200).json({ status: 'success', medidas });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  guardarMedidas,
  obtenerMedidas
};