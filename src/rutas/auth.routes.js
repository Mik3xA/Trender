const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const authController = require('../controladores/auth.controller');
const manejarValidacion = require('../middlewares/validacion.middleware');

const router = express.Router();

const limitarAutenticacion = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', error: 'Too Many Requests' }
});

router.use(limitarAutenticacion);

const validarSolicitudCodigo = [
  body('email')
    .exists({ checkFalsy: true })
    .withMessage('email es requerido')
    .isEmail()
    .withMessage('email debe ser un email válido')
    .normalizeEmail()
];

const validarVerificacionCodigo = [
  ...validarSolicitudCodigo,
  body('codigo')
    .exists({ checkFalsy: true })
    .withMessage('codigo es requerido')
    .isString()
    .withMessage('codigo debe ser string')
    .matches(/^\d{6}$/)
    .withMessage('codigo debe tener 6 dígitos')
];

const validarRegistro = [
  body('nombre')
    .exists({ checkFalsy: true })
    .withMessage('nombre es requerido')
    .isString()
    .withMessage('nombre debe ser string')
    .trim()
    .isLength({ min: 1, max: 80 })
    .withMessage('nombre debe tener entre 1 y 80 caracteres'),
  body('email')
    .exists({ checkFalsy: true })
    .withMessage('email es requerido')
    .isEmail()
    .withMessage('email debe ser un email válido')
    .normalizeEmail(),
  body('password')
    .exists({ checkFalsy: true })
    .withMessage('password es requerido')
    .isString()
    .withMessage('password debe ser string')
    .isLength({ min: 8, max: 128 })
    .withMessage('password debe tener entre 8 y 128 caracteres')
];

const validarLogin = [
  body('email')
    .exists({ checkFalsy: true })
    .withMessage('email es requerido')
    .isEmail()
    .withMessage('email debe ser un email válido')
    .normalizeEmail(),
  body('password')
    .exists({ checkFalsy: true })
    .withMessage('password es requerido')
    .isString()
    .withMessage('password debe ser string')
];

router.post(
  '/solicitar-codigo',
  validarSolicitudCodigo,
  manejarValidacion,
  authController.solicitarCodigo
);

router.post(
  '/verificar-codigo',
  validarVerificacionCodigo,
  manejarValidacion,
  authController.verificarCodigo
);

router.post('/registro', validarRegistro, manejarValidacion, authController.registrar);

router.post('/login', validarLogin, manejarValidacion, authController.iniciarSesion);

router.get('/me', authController.obtenerPerfil);

module.exports = router;
