const express = require('express');
const { body } = require('express-validator');
const ropaController = require('../controladores/ropa.controller');
const manejarValidacion = require('../middlewares/validacion.middleware');

const router = express.Router();

const validarEscanearLink = [
  body('url').trim().notEmpty().withMessage('La URL es requerida'),
];

router.post('/escanear-link', validarEscanearLink, manejarValidacion, ropaController.escanearLink);

module.exports = router;