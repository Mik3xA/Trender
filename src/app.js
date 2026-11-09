const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const indexRoutes = require('./rutas/index.routes');
const webhookRoutes = require('./rutas/webhooks.routes');
const errorHandler = require('./controladores/error.controller');

const app = express();

// CORS abierto en desarrollo; en producción solo los orígenes de ALLOWED_ORIGINS.
// (La app Flutter nativa no envía Origin, así que no se ve afectada.)
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

// Frontend web de Trender (HTML/CSS/JS estáticos).
app.use(express.static(path.join(__dirname, '../public'), { index: 'index.html' }));

app.use('/api', indexRoutes);
app.use('/webhooks', webhookLimiter, webhookRoutes);

app.use((req, res) => {
  res.status(404).json({ status: 'error', error: 'Not Found' });
});

app.use(errorHandler);

module.exports = app;
