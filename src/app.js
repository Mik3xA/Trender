const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const indexRoutes = require('./rutas/index.routes');
const { UPLOADS_DIR } = require('./servicios/closet.service');
const webhookRoutes = require('./rutas/webhooks.routes');
const errorHandler = require('./controladores/error.controller');

const app = express();

// CORS: si ALLOWED_ORIGINS está definido solo esos orígenes (p. ej. el frontend
// Angular en http://localhost:4200); si no, abierto (desarrollo). La app Flutter
// nativa no envía cabecera Origin, así que no se ve afectada.
const origenes = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);

app.use(helmet());
app.use(cors(origenes?.length ? { origin: origenes } : undefined));
app.use(morgan('dev', { skip: () => process.env.NODE_ENV === 'test' }));
app.use(express.json({ limit: '100kb' }));

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas peticiones, intente más tarde' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Recortes de prendas (PNG). Rutas con UUID del usuario y de la prenda, no adivinables.
// cross-origin: el visor 3D (otro origen en desarrollo) los carga como textura WebGL.
app.use(
  '/media',
  helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }),
  express.static(UPLOADS_DIR, { index: false, dotfiles: 'deny', maxAge: '7d', fallthrough: false })
);

app.use('/api', indexRoutes);
app.use('/webhooks', webhookLimiter, webhookRoutes);

app.use((req, res) => {
  res.status(404).json({ status: 'error', error: 'Not Found' });
});

app.use(errorHandler);

module.exports = app;
