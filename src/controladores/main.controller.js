const { guardarDatos } = require('../servicios/db.service');
const { enviarAlerta, enviarAlertaError } = require('../servicios/email.service');

// El payload ya llega validado por webhooks.routes.js (express-validator).

async function procesarWebhook(req, res, next) {
  try {
    const datos = req.body;
    const resultadoDb = await guardarDatos(datos);

    const mensajeAlerta = `
Webhook procesado correctamente:
----------------------------
Transaction ID: ${datos.transaction_id}
Amount: ${datos.amount} ${datos.currency || 'USD'}
Customer Email: ${datos.customer_email}
DB Record ID: ${resultadoDb.id}
Duplicado: ${resultadoDb.duplicated ? 'Sí' : 'No'}
    `.trim();

    await enviarAlerta(mensajeAlerta);

    res.status(200).json({
      status: 'success',
      message: 'Webhook procesado',
      data: {
        transaction_id: datos.transaction_id,
        db_id: resultadoDb.id,
        duplicated: resultadoDb.duplicated || false,
      },
    });
  } catch (err) {
    try {
      await enviarAlertaError(req.body, err);
    } catch (emailErr) {
      console.error('[Controller] Fallo al enviar email de error:', emailErr.message);
    }
    next(err);
  }
}

async function healthCheck(req, res) {
  res.json({ status: 'ok', message: 'Trender server is running' });
}

module.exports = {
  procesarWebhook,
  healthCheck,
};
