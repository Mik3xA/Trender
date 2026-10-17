const express = require('express');
const { body, validationResult } = require('express-validator');
const mainController = require('../controladores/main.controller');

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
];

const manejarValidacion = (req, res, next) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    const err = new Error('Validación fallida');
    err.statusCode = 400;
    err.errors = errores.array().map(e => ({ field: e.path, message: e.msg }));
    return next(err);
  }
  next();
};

router.post('/recibir', validarWebhook, manejarValidacion, mainController.procesarWebhook);

module.exports = router;