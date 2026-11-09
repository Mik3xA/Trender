const request = require('supertest');

let contador = 0;

/** Registra un usuario nuevo y devuelve { token, user, auth } listo para supertest. */
async function crearUsuario(app, prefijo = 'usuario') {
  contador += 1;
  const email = `${prefijo}${contador}@trender.test`;
  const res = await request(app).post('/api/auth/register').send({ email, password: 'clave-segura-123' });
  if (res.status !== 201) throw new Error(`registro falló: ${res.status} ${JSON.stringify(res.body)}`);
  const { token, user } = res.body.data;
  return { token, user, email, auth: { Authorization: `Bearer ${token}` } };
}

module.exports = { crearUsuario };
