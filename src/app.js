const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    const esProduccion = process.env.NODE_ENV === 'production';

    if (!origin || !esProduccion || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    const error = new Error('Origen no permitido por CORS');
    error.statusCode = 403;
    return callback(error);
  }
};

app.use(helmet());
app.use(morgan('dev'));
app.use(cors(corsOptions));
app.use(express.json());

const rutasWebhooks = require('./rutas/webhooks.routes');
const rutasAuth = require('./rutas/auth.routes');
const rutasMedidas = require('./rutas/medidas.routes');
const rutasRopa = require('./rutas/ropa.routes');
const manejarErrores = require('./controladores/error.controller');

app.use('/webhooks', rutasWebhooks);
app.use('/api/auth', rutasAuth);
app.use('/api/medidas', rutasMedidas);
app.use('/api/ropa', rutasRopa);

app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

app.use(manejarErrores);

module.exports = app;