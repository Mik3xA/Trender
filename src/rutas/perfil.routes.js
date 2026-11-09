const express = require('express');
const { body } = require('express-validator');

const perfilController = require('../controladores/perfil.controller');
const { manejarValidacion } = require('../middlewares/validacion.middleware');

const router = express.Router();

// Rangos en cm, iguales a los CHECK de la tabla user_profiles. null borra la medida.
const medida = (campo, min, max) =>
  body(campo)
    .optional({ values: 'undefined' })
    .custom((v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max))
    .withMessage(`${campo} debe ser un número entre ${min} y ${max} (cm) o null`);

router.get('/', perfilController.obtener);

router.put(
  '/',
  medida('altura', 50, 260),
  medida('pecho', 30, 200),
  medida('cintura', 30, 200),
  medida('cadera', 30, 200),
  body('avatar_config').optional().isObject().withMessage('avatar_config debe ser un objeto JSON'),
  manejarValidacion,
  perfilController.actualizar
);

module.exports = router;
