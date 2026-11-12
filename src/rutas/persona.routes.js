const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, header, param } = require('express-validator');

const personaController = require('../controladores/persona.controller');
const { manejarValidacion } = require('../middlewares/validacion.middleware');

const router = express.Router();

const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif'];
const limitador = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { status: 'error', error: 'Demasiadas fotos, intenta más tarde' } });
const validarId = param('id').isUUID().withMessage('id de foto inválido');

router.get('/', personaController.listar);
router.post(
  '/',
  limitador,
  express.raw({ type: TIPOS_FOTO, limit: '15mb' }),
  header('content-type')
    .custom((v) => TIPOS_FOTO.includes(String(v).split(';')[0].trim().toLowerCase()))
    .withMessage(`La foto debe enviarse como ${TIPOS_FOTO.join(', ')}`),
  body().custom((b) => Buffer.isBuffer(b) && b.length > 0).withMessage('Falta la imagen en el cuerpo de la petición'),
  manejarValidacion,
  personaController.subir
);
router.get('/:id/imagen', validarId, manejarValidacion, personaController.imagen);
router.delete('/:id', validarId, manejarValidacion, personaController.eliminar);

module.exports = router;
