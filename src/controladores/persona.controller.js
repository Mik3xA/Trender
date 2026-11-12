const personaService = require('../servicios/persona.service');

// Fotos de la persona: siempre las del usuario de la sesión (req.auth.userId).

async function subir(req, res, next) {
  try {
    const foto = await personaService.subirFoto(req.auth.userId, req.body);
    res.status(201).location(`/api/persona/${foto.id}`).json({ status: 'success', data: foto });
  } catch (err) {
    next(err);
  }
}

async function listar(req, res, next) {
  try {
    const fotos = personaService.listar(req.auth.userId);
    res.status(200).json({ status: 'success', data: { items: fotos, count: fotos.length } });
  } catch (err) {
    next(err);
  }
}

async function imagen(req, res, next) {
  try {
    const buffer = personaService.leerImagen(req.auth.userId, req.params.id);
    res.status(200).type('image/jpeg').set('Cache-Control', 'private, max-age=3600').send(buffer);
  } catch (err) {
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    res.status(200).json({ status: 'success', data: personaService.eliminar(req.auth.userId, req.params.id) });
  } catch (err) {
    next(err);
  }
}

module.exports = { subir, listar, imagen, eliminar };
