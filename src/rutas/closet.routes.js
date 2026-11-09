const express = require('express');
const { body, param, query } = require('express-validator');

const closetController = require('../controladores/closet.controller');
const { CATEGORIAS } = require('../servicios/closet.service');
const { manejarValidacion } = require('../middlewares/validacion.middleware');

const router = express.Router();

const validarCategoria = (cadena) =>
  cadena.isIn(CATEGORIAS).withMessage(`category debe ser uno de: ${CATEGORIAS.join(', ')}`);
const validarId = param('id').isUUID().withMessage('id de prenda inválido');

router.get('/', validarCategoria(query('category').optional()), manejarValidacion, closetController.listar);

router.post(
  '/add-from-link',
  body('url')
    .isString().withMessage('url es requerida')
    .trim()
    .isLength({ min: 1, max: 2048 }).withMessage('url debe tener entre 1 y 2048 caracteres')
    .isURL({ protocols: ['http', 'https'], require_protocol: true }).withMessage('url debe ser http(s) válida'),
  validarCategoria(body('category')),
  manejarValidacion,
  closetController.agregarDesdeLink
);

router.get('/:id', validarId, manejarValidacion, closetController.obtener);
router.patch('/:id', validarId, validarCategoria(body('category')), manejarValidacion, closetController.actualizarCategoria);
router.delete('/:id', validarId, manejarValidacion, closetController.eliminar);

module.exports = router;
