const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param } = require('express-validator');

const pruebaController = require('../controladores/prueba.controller');
const { PARTES_OUTFIT } = require('../servicios/closet.service');
const { MAX_PRENDAS } = require('../servicios/prueba.service');
const { manejarValidacion } = require('../middlewares/validacion.middleware');

const router = express.Router();

// Cada prueba llama a una IA de pago: límite propio.
const limitador = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.TRYON_RATE_LIMIT) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', error: 'Demasiadas pruebas seguidas, espera unos minutos' },
});
const validarId = param('id').isUUID().withMessage('id de prueba inválido');

router.get('/estado', pruebaController.estado);
router.get('/', pruebaController.listar);
router.post(
  '/',
  limitador,
  body('personaId').isUUID().withMessage('personaId inválido'),
  body('prendas').isArray({ min: 1, max: MAX_PRENDAS }).withMessage(`prendas debe tener de 1 a ${MAX_PRENDAS} elementos`),
  body('prendas.*.id').isUUID().withMessage('id de prenda inválido'),
  body('prendas')
    .custom((lista) => new Set(lista.map((p) => p?.id)).size === lista.length)
    .withMessage('Una prenda aparece repetida'),
  body('prendas.*.usar')
    .optional()
    .isArray({ min: 1, max: 4 }).withMessage('usar debe ser una lista de partes')
    .custom((lista) => lista.every((p) => PARTES_OUTFIT.includes(p)))
    .withMessage(`usar admite: ${PARTES_OUTFIT.join(', ')}`),
  manejarValidacion,
  pruebaController.crear
);
router.get('/:id', validarId, manejarValidacion, pruebaController.obtener);
router.get('/:id/imagen', validarId, manejarValidacion, pruebaController.imagen);
router.delete('/:id', validarId, manejarValidacion, pruebaController.eliminar);

module.exports = router;
