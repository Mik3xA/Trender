const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const rutasWebhooks = require('./rutas/webhooks.routes');
const manejarErrores = require('./controladores/error.controller');

// Se agrega el prefijo '/webhooks' para que coincida con la petición de Angular
app.use('/webhooks', rutasWebhooks);
app.use(manejarErrores);

module.exports = app;