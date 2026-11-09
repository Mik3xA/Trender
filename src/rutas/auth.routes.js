const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');

const authController = require('../controladores/auth.controller');
const { requerirAuth } = require('../middlewares/auth.middleware');
const { manejarValidacion } = require('../middlewares/validacion.middleware');

const router = express.Router();

// Freno a la fuerza bruta de credenciales (independiente del límite de /webhooks).
const limitadorCredenciales = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 20,
  message: { status: 'error', error: 'Demasiados intentos, intente más tarde' },
  standardHeaders: true,
  legacyHeaders: false,
});

// bcrypt solo usa los primeros 72 bytes: se rechaza lo que exceda para no truncar en silencio.
const validarPassword = body('password')
  .isString().withMessage('password debe ser texto')
  .isLength({ min: 8 }).withMessage('password debe tener al menos 8 caracteres')
  .custom((v) => Buffer.byteLength(v) <= 72).withMessage('password no puede superar 72 bytes');

const validarEmail = body('email')
  .isString().withMessage('email es requerido')
  .trim()
  .isLength({ max: 254 }).withMessage('email demasiado largo')
  .isEmail().withMessage('email debe ser válido');

router.post('/register', limitadorCredenciales, validarEmail, validarPassword, manejarValidacion, authController.registrar);

router.post(
  '/login',
  limitadorCredenciales,
  validarEmail,
  body('password').isString().notEmpty().withMessage('password es requerido'),
  manejarValidacion,
  authController.iniciarSesion
);

router.post('/logout', requerirAuth, authController.cerrarSesion);
router.get('/me', requerirAuth, authController.usuarioActual);

module.exports = router;
