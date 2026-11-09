const authService = require('../servicios/auth.service');
const { obtenerPerfil } = require('../servicios/perfil.service');

// Controladores delgados: los datos ya llegan validados por la ruta; la lógica
// vive en auth.service.js. Cualquier error va al manejador central con next(err).

async function registrar(req, res, next) {
  try {
    const { nombre, email, password } = req.body;
    const sesion = await authService.registrar({ nombre, email, password, userAgent: req.get('user-agent') });
    res.status(201).json({ status: 'success', data: sesion });
  } catch (err) {
    next(err);
  }
}

async function iniciarSesion(req, res, next) {
  try {
    const { email, password } = req.body;
    const sesion = await authService.iniciarSesion({ email, password, userAgent: req.get('user-agent') });
    res.status(200).json({ status: 'success', data: sesion });
  } catch (err) {
    next(err);
  }
}

/** Revoca la sesión actual y limpia la caché temporal del usuario. */
async function cerrarSesion(req, res, next) {
  try {
    const resultado = authService.cerrarSesion(req.auth);
    res.status(200).json({ status: 'success', message: 'Sesión cerrada', data: resultado });
  } catch (err) {
    next(err);
  }
}

async function usuarioActual(req, res, next) {
  try {
    const user = authService.obtenerUsuario(req.auth.userId);
    const profile = obtenerPerfil(req.auth.userId);
    res.status(200).json({ status: 'success', data: { user, profile } });
  } catch (err) {
    next(err);
  }
}

module.exports = { registrar, iniciarSesion, cerrarSesion, usuarioActual };
