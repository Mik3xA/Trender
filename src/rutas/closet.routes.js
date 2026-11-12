const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, header, param, query } = require('express-validator');

const closetController = require('../controladores/closet.controller');
const { CATEGORIAS, GENEROS } = require('../servicios/closet.service');
const { manejarValidacion } = require('../middlewares/validacion.middleware');

const router = express.Router();

// Importar descarga páginas e imágenes: se limita para no usar el servidor como robot.
const limitadorImportacion = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.IMPORT_RATE_LIMIT) || 40,
  message: { status: 'error', error: 'Demasiadas importaciones, intenta más tarde' },
  standardHeaders: true,
  legacyHeaders: false,
});

const validarCategoria = (cadena) => cadena.isIn(CATEGORIAS).withMessage(`category debe ser uno de: ${CATEGORIAS.join(', ')}`);
const validarGenero = (cadena) => cadena.isIn(GENEROS).withMessage(`genero debe ser uno de: ${GENEROS.join(', ')}`);
const validarId = param('id').isUUID().withMessage('id de prenda inválido');

const validarImportacion = [
  body('url')
    .isString().withMessage('url es requerida')
    .trim()
    .isLength({ min: 1, max: 2048 }).withMessage('url debe tener entre 1 y 2048 caracteres')
    .isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('url debe ser http(s) válida'),
  validarGenero(body('genero').optional()),
  validarCategoria(body('category').optional()),
];

router.get(
  '/',
  validarCategoria(query('category').optional()),
  validarGenero(query('genero').optional()),
  manejarValidacion,
  closetController.listar
);

router.post('/importar', limitadorImportacion, validarImportacion, manejarValidacion, closetController.importar);
// Alias histórico (misma operación).
router.post('/add-from-link', limitadorImportacion, validarImportacion, manejarValidacion, closetController.importar);

// Subir foto: el cuerpo es la imagen tal cual (sin multipart). Límite 12 MB.
const MAX_FOTO = '12mb';
const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/tiff', 'image/heic', 'image/heif'];
const validarImagenCuerpo = [
  express.raw({ type: TIPOS_FOTO, limit: MAX_FOTO }),
  header('content-type')
    .custom((valor) => TIPOS_FOTO.includes(String(valor).split(';')[0].trim().toLowerCase()))
    .withMessage(`La foto debe enviarse como ${TIPOS_FOTO.join(', ')}`),
  body()
    .custom((cuerpo) => Buffer.isBuffer(cuerpo) && cuerpo.length > 0)
    .withMessage('Falta la imagen en el cuerpo de la petición'),
];
const validarSubida = [
  ...validarImagenCuerpo,
  validarGenero(query('genero').optional()),
  validarCategoria(query('category').optional()),
  query('nombre').optional().isString().trim().isLength({ max: 120 }).withMessage('nombre: máximo 120 caracteres'),
];
router.post('/subir', limitadorImportacion, validarSubida, manejarValidacion, closetController.subir);

router.post('/:id/foto', limitadorImportacion, validarId, validarImagenCuerpo, manejarValidacion, closetController.agregarFoto);
router.get('/:id', validarId, manejarValidacion, closetController.obtener);
router.patch(
  '/:id',
  validarId,
  validarCategoria(body('category')),
  body('tipo').optional().isString().isLength({ min: 1, max: 30 }).withMessage('tipo inválido'),
  manejarValidacion,
  closetController.actualizar
);
router.delete('/:id', validarId, manejarValidacion, closetController.eliminar);

module.exports = router;
