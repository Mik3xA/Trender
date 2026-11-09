const express = require('express');

const mainController = require('../controladores/main.controller');
const { requerirAuth } = require('../middlewares/auth.middleware');
const authRoutes = require('./auth.routes');
const perfilRoutes = require('./perfil.routes');
const closetRoutes = require('./closet.routes');
const ropaRoutes = require('./ropa.routes');

const router = express.Router();

// Públicas
router.get('/health', mainController.healthCheck);
router.use('/auth', authRoutes); // register/login públicos; logout/me protegidos dentro
router.use('/ropa', ropaRoutes); // escáner de links (vista previa sin sesión)

// Protegidas: requerirAuth fija req.auth.userId antes de cualquier controlador
router.use('/profile', requerirAuth, perfilRoutes);
router.use('/closet', requerirAuth, closetRoutes);

module.exports = router;
