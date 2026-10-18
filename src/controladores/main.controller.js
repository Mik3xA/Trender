const { guardarDatos } = require('../servicios/db.service');
const { enviarAlerta, enviarAlertaError } = require('../servicios/email.service');

function validarPayload(datos) {
  const errores = [];

  if (!datos || typeof datos !== 'object') {
    errores.push('El cuerpo de la petición debe ser un objeto JSON válido');
    return errores;
  }

  if (!datos.transaction_id || typeof datos.transaction_id !== 'string') {
    errores.push('Campo "transaction_id" es requerido y debe ser string');
  }

  if (datos.amount === undefined || datos.amount === null) {
    errores.push('Campo "amount" es requerido');
  } else if (typeof datos.amount !== 'number' || datos.amount <= 0) {
    errores.push('Campo "amount" debe ser un número mayor a 0');
  }

  if (!datos.customer_email || typeof datos.customer_email !== 'string') {
    errores.push('Campo "customer_email" es requerido y debe ser string');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.customer_email)) {
    errores.push('Campo "customer_email" debe tener formato de email válido');
  }

  if (datos.currency !== undefined && typeof datos.currency !== 'string') {
    errores.push('Campo "currency" debe ser string');
  }

  if (datos.avatar_data !== undefined) {
    const avatar = datos.avatar_data;
    if (!avatar || typeof avatar !== 'object') {
      errores.push('Campo "avatar_data" debe ser un objeto');
    } else {
      if (typeof avatar.estatura !== 'number' || avatar.estatura <= 0) {
        errores.push('Campo "avatar_data.estatura" debe ser un número mayor a 0');
      }
      if (typeof avatar.peso !== 'number' || avatar.peso <= 0) {
        errores.push('Campo "avatar_data.peso" debe ser un número mayor a 0');
      }
      if (typeof avatar.complexion !== 'string' || !avatar.complexion.trim()) {
        errores.push('Campo "avatar_data.complexion" debe ser un string no vacío');
      }
    }
  }

  return errores;
}

async function procesarWebhook(req, res, next) {
  try {
    const datos = req.body;

    const erroresValidacion = validarPayload(datos);
    if (erroresValidacion.length > 0) {
      const err = new Error('Validación fallida');
      err.statusCode = 400;
      err.errors = erroresValidacion;
      throw err;
    }

    const resultadoDb = await guardarDatos(datos);

    const mensajeAlerta = `
Webhook procesado correctamente:
----------------------------
Transaction ID: ${datos.transaction_id}
Amount: ${datos.amount} ${datos.currency || 'USD'}
Customer Email: ${datos.customer_email}
DB Record ID: ${resultadoDb.id}
Duplicado: ${resultadoDb.duplicado ? 'Sí' : 'No'}
    `.trim();

    await enviarAlerta(mensajeAlerta);

    res.status(200).json({
      status: 'success',
      message: 'Webhook procesado',
      id: resultadoDb.id,
      data: {
        transaction_id: datos.transaction_id,
        db_id: resultadoDb.id,
        duplicated: resultadoDb.duplicated || false
      }
    });
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({
        status: 'error',
        message: err.message,
        errors: err.errors
      });
    }

    console.error('[Controller] Error procesando webhook:', err);

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
  healthCheck
};