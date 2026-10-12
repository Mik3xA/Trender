const { guardarDatos } = require('../servicios/db.service');
const { enviarAlerta } = require('../servicios/email.service');

function procesarWebhook(req, res) {
  const datos = req.body;

  if (!datos || Object.keys(datos).length === 0) {
    return res.status(400).json({ status: 'error', message: 'Cuerpo de la petición vacío' });
  }

  guardarDatos(datos);
  enviarAlerta(`Webhook recibido con datos: ${JSON.stringify(datos)}`);

  res.status(200).json({ status: 'success', message: 'Webhook procesado' });
}

module.exports = { procesarWebhook };