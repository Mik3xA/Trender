const express = require('express');
const { body } = require('express-validator');
const medidasController = require('../controladores/medidas.controller');
const { autenticar } = require('../middlewares/auth.middleware');
const manejarValidacion = require('../middlewares/validacion.middleware');

const router = express.Router();

router.use(autenticar);

const validarMedidas = [
  body('estatura').isFloat({ min: 80, max: 250 }).withMessage('Estatura inválida'),
  body('peso').isFloat({ min: 30, max: 300 }).withMessage('Peso inválido'),
  body('complexion').isIn(['Delgada', 'Atlética', 'Media', 'Robusta']).withMessage('Complexión inválida'),
  body('genero').isIn(['Masculino', 'Femenino']).withMessage('Género inválido')
];

router.get('/medidas', medidasController.obtenerMedidas);
router.post('/medidas', validarMedidas, manejarValidacion, medidasController.guardarMedidas);

module.exports = router;