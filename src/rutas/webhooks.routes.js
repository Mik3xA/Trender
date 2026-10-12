const express = require('express');
const router = express.Router();
const mainController = require('../controladores/main.controller');

router.post('/recibir', mainController.procesarWebhook);

module.exports = router;