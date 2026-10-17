const express = require('express');
const router = express.Router();
const mainController = require('../controladores/main.controller');

router.get('/health', mainController.healthCheck);

module.exports = router;