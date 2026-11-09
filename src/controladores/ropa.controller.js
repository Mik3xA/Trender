const ropaService = require('../servicios/ropa.service');

/** POST /api/ropa/escanear-link — vista previa de la prenda (no requiere sesión). */
async function escanearLink(req, res, next) {
  try {
    const prenda = await ropaService.escanearUrl(req.body.url);
    res.status(200).json({ status: 'success', data: { prenda } });
  } catch (err) {
    next(err);
  }
}

module.exports = { escanearLink };
