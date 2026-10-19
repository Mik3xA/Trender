const ropaService = require('../servicios/ropa.service');

async function escanearLink(req, res, next) {
  try {
    const { url } = req.body;

    if (!url || !url.trim()) {
      return res.status(400).json({
        success: false,
        message: 'La URL es requerida'
      });
    }

    const prenda = await ropaService.escanearUrl(url.trim());

    return res.status(200).json({
      success: true,
      prenda
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  escanearLink
};