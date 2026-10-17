const nodemailer = require('nodemailer');

let transporter = null;

function crearTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[Email] Configuración SMTP incompleta. Se simulará el envío.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

async function enviarAlerta(mensaje, asunto = 'Nuevo Webhook Recibido') {
  const from = process.env.EMAIL_FROM || 'Trender Webhooks <noreply@trender.local>';
  const to = process.env.EMAIL_TO || 'admin@trender.local';

  const esProduccion = process.env.NODE_ENV === 'production';
  const tx = esProduccion ? crearTransporter() : null;

  if (!esProduccion || !tx) {
    console.log(`[Email - MODO SIMULADO] Asunto: ${asunto} | Destinatario: ${to}`);
    return { status: 'simulated', success: true };
  }

  try {
    const info = await tx.sendMail({
      from,
      to,
      subject: asunto,
      text: mensaje,
      html: `<pre style="font-family: monospace; white-space: pre-wrap;">${mensaje}</pre>`,
    });

    console.log(`[Email] Enviado: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Email] Error al enviar:', err.message);
    throw err;
  }
}

async function enviarAlertaError(datosWebhook, error) {
  const mensaje = `
Error procesando webhook:
----------------------------
Transaction ID: ${datosWebhook?.transaction_id || 'N/A'}
Amount: ${datosWebhook?.amount || 'N/A'}
Customer Email: ${datosWebhook?.customer_email || 'N/A'}

Error: ${error.message}
Stack: ${error.stack}
  `.trim();

  return enviarAlerta(mensaje, '⚠️ Error en Webhook - Trender');
}

module.exports = {
  enviarAlerta,
  enviarAlertaError
};