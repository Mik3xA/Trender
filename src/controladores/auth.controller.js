const authService = require('../servicios/auth.service');

function responderNoAutorizado(res, mensaje = 'No autorizado') {
  return res.status(401).json({ status: 'error', message: mensaje });
}

async function solicitarCodigo(req, res, next) {
  try {
    await authService.solicitarCodigo(req.body.email);
    return res.status(200).json({
      status: 'success',
      message: 'Código enviado'
    });
  } catch (error) {
    return next(error);
  }
}

function verificarCodigo(req, res, next) {
  try {
    const sesion = authService.verificarCodigo(req.body.email, req.body.codigo);

    if (!sesion) {
      return responderNoAutorizado(res, 'Código inválido');
    }

    return res.status(200).json({
      status: 'success',
      ...sesion
    });
  } catch (error) {
    return next(error);
  }
}

async function registrar(req, res, next) {
  try {
    const sesion = await authService.registrarUsuario(req.body);
    return res.status(201).json({
      status: 'success',
      ...sesion
    });
  } catch (error) {
    if (error.statusCode === 409) {
      return res.status(409).json({
        status: 'error',
        message: error.message
      });
    }
    return next(error);
  }
}

async function iniciarSesion(req, res, next) {
  try {
    const sesion = await authService.iniciarSesion(req.body);

    if (!sesion) {
      return responderNoAutorizado(res, 'Credenciales inválidas');
    }

    return res.status(200).json({
      status: 'success',
      ...sesion
    });
  } catch (error) {
    return next(error);
  }
}

function obtenerPerfil(req, res) {
  const autorizacion = req.headers.authorization ?? '';
  const token = autorizacion.startsWith('Bearer ') ? autorizacion.slice(7).trim() : '';
  const usuario = authService.obtenerPerfil(token);

  if (!usuario) {
    return responderNoAutorizado(res);
  }

  return res.status(200).json({
    status: 'success',
    user: usuario
  });
}

module.exports = {
  solicitarCodigo,
  verificarCodigo,
  registrar,
  iniciarSesion,
  obtenerPerfil
};
