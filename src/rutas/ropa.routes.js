const express = require('express');
const { body } = require('express-validator');

const ropaController = require('../controladores/ropa.controller');
const { manejarValidacion } = require('../middlewares/validacion.middleware');

const router = express.Router();

router.post(
  '/escanear-link',
  body('url')
    .isString().withMessage('La URL es requerida')
    .trim()
    .notEmpty().withMessage('La URL es requerida')
    .isLength({ max: 2048 }).withMessage('La URL supera 2048 caracteres'),
  manejarValidacion,
  ropaController.escanearLink
);

module.exports = router;
