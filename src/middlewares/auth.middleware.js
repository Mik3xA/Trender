const jwt = require('jsonwebtoken');
const { obtenerUsuarioPorEmail } = require('../servicios/db.service');

function obtenerSecreto() {
  const secreto = process.env.JWT_SECRET;

  if (secreto) {
    return secreto;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es obligatorio en producción');
  }

  return 'trender-demo-secret';
}

function autenticar(req, res, next) {
  const autorizacion = req.headers.authorization ?? '';
  const token = autorizacion.startsWith('Bearer ') ? autorizacion.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Token requerido' });
  }

  try {
    const payload = jwt.verify(token, obtenerSecreto());

    if (!payload || typeof payload !== 'object' || !payload.sub || !payload.email) {
      return res.status(401).json({ status: 'error', message: 'Token inválido' });
    }

    const usuario = obtenerUsuarioPorEmail(payload.email);

    if (!usuario) {
      return res.status(401).json({ status: 'error', message: 'Usuario no encontrado' });
    }

    req.usuario = { id: usuario.id, email: usuario.email, nombre: usuario.nombre };
    next();
  } catch {
    return res.status(401).json({ status: 'error', message: 'Token inválido o expirado' });
  }
}

module.exports = { autenticar };