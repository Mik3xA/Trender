const express = require('express');
const indexRoutes = require('./rutas/index.routes');
const webhookRoutes = require('./rutas/webhooks.routes');

const app = express();

app.use(express.json());

app.use('/api', indexRoutes);
app.use('/webhooks', webhookRoutes);

module.exports = app;