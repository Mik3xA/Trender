const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const indexRoutes = require('./rutas/index.routes');
const webhookRoutes = require('./rutas/webhooks.routes');
const errorHandler = require('./controladores/error.controller');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas peticiones, intente más tarde' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', indexRoutes);
app.use('/webhooks', webhookLimiter, webhookRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use(errorHandler);

module.exports = app;