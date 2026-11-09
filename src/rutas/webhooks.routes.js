const express = require('express');
const { body } = require('express-validator');
const mainController = require('../controladores/main.controller');
const { manejarValidacion } = require('../middlewares/validacion.middleware');

const router = express.Router();

const validarWebhook = [
  body('transaction_id')
    .exists({ checkFalsy: true })
    .withMessage('transaction_id es requerido')
    .isString()
    .withMessage('transaction_id debe ser string')
    .trim()
    .notEmpty()
    .withMessage('transaction_id no puede estar vacío'),
  body('amount')
    .exists({ checkFalsy: true })
    .withMessage('amount es requerido')
    .isFloat({ gt: 0 })
    .withMessage('amount debe ser un número mayor a 0'),
  body('customer_email')
    .exists({ checkFalsy: true })
    .withMessage('customer_email es requerido')
    .isEmail()
    .withMessage('customer_email debe ser un email válido')
    .normalizeEmail(),
  body('currency')
    .optional()
    .isString()
    .withMessage('currency debe ser string')
    .isLength({ min: 3, max: 3 })
    .withMessage('currency debe ser código ISO de 3 letras'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('metadata debe ser un objeto'),
  // Datos del avatar que envía el frontend al generar el modelo 3D (opcional).
  body('avatar_data')
    .optional()
    .isObject()
    .withMessage('avatar_data debe ser un objeto'),
  body('avatar_data.estatura')
    .if(body('avatar_data').exists())
    .isFloat({ gt: 0 })
    .withMessage('avatar_data.estatura debe ser un número mayor a 0'),
  body('avatar_data.peso')
    .if(body('avatar_data').exists())
    .isFloat({ gt: 0 })
    .withMessage('avatar_data.peso debe ser un número mayor a 0'),
  body('avatar_data.complexion')
    .if(body('avatar_data').exists())
    .isString()
    .trim()
    .notEmpty()
    .withMessage('avatar_data.complexion debe ser un texto no vacío'),
  body('avatar_data.genero')
    .optional()
    .isString()
    .withMessage('avatar_data.genero debe ser texto'),
];

router.post('/recibir', validarWebhook, manejarValidacion, mainController.procesarWebhook);

module.exports = router;