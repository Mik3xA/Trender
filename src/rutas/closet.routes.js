const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, header, param, query } = require('express-validator');

const closetController = require('../controladores/closet.controller');
const { CATEGORIAS, GENEROS, TIPOS, OPCIONES_AJUSTES, PARTES_OUTFIT } = require('../servicios/closet.service');
const { manejarValidacion } = require('../middlewares/validacion.middleware');

const router = express.Router();

// Analizar fotos consume CPU: se limita por usuario/IP.
const limitadorImportacion = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.IMPORT_RATE_LIMIT) || 120,
  message: { status: 'error', error: 'Demasiadas importaciones, intenta más tarde' },
  standardHeaders: true,
  legacyHeaders: false,
});

const validarCategoria = (cadena) => cadena.isIn(CATEGORIAS).withMessage(`category debe ser uno de: ${CATEGORIAS.join(', ')}`);
const validarGenero = (cadena) => cadena.isIn(GENEROS).withMessage(`genero debe ser uno de: ${GENEROS.join(', ')}`);
const validarId = param('id').isUUID().withMessage('id de prenda inválido');

router.get(
  '/',
  validarCategoria(query('category').optional()),
  validarGenero(query('genero').optional()),
  manejarValidacion,
  closetController.listar
);

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
  query('tipo').optional().isIn(TIPOS).withMessage(`tipo debe ser uno de: ${TIPOS.join(', ')}`),
  query('nombre').optional().isString().trim().isLength({ max: 120 }).withMessage('nombre: máximo 120 caracteres'),
];
router.post('/subir', limitadorImportacion, validarSubida, manejarValidacion, closetController.subir);

router.post('/:id/foto', limitadorImportacion, validarId, validarImagenCuerpo, manejarValidacion, closetController.agregarFoto);
router.get('/:id', validarId, manejarValidacion, closetController.obtener);
router.patch(
  '/:id',
  validarId,
  validarCategoria(body('category')),
  body('tipo').optional().isIn(TIPOS).withMessage(`tipo debe ser uno de: ${TIPOS.join(', ')}`),
  // Cuestionario: solo claves conocidas y valores de la lista (o null para borrar).
  body('ajustes')
    .optional({ values: 'null' })
    .isObject().withMessage('ajustes debe ser un objeto')
    .custom((a) => Object.keys(a).every((k) => ['ajuste', 'largo', 'manga', 'capucha', 'cuello', 'usar', 'aspecto'].includes(k)))
    .withMessage('ajustes solo admite ajuste, largo, manga, capucha, cuello, aspecto y usar'),
  ...Object.entries(OPCIONES_AJUSTES).map(([clave, valores]) =>
    body(`ajustes.${clave}`).optional().isIn(valores).withMessage(`ajustes.${clave} debe ser uno de: ${valores.join(', ')}`)
  ),
  body('ajustes.capucha').optional().isBoolean({ strict: true }).withMessage('ajustes.capucha debe ser true o false'),
  body('ajustes.cuello').optional().isBoolean({ strict: true }).withMessage('ajustes.cuello debe ser true o false'),
  // Outfit completo: qué partes usar (arriba, abajo, vestido, calzado).
  body('ajustes.usar')
    .optional()
    .isArray({ min: 1, max: 4 }).withMessage('ajustes.usar debe ser una lista de 1 a 4 partes')
    .custom((lista) => lista.every((p) => PARTES_OUTFIT.includes(p)) && new Set(lista).size === lista.length)
    .withMessage(`ajustes.usar admite: ${PARTES_OUTFIT.join(', ')}`),
  manejarValidacion,
  closetController.actualizar
);
router.delete('/:id', validarId, manejarValidacion, closetController.eliminar);

module.exports = router;
