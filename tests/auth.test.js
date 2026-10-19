const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');

const dbPath = path.join(os.tmpdir(), `trender-auth-${process.pid}.db`);

fs.rmSync(dbPath, { force: true });
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const { cerrarDb } = require('../src/servicios/db.service');

function emailUnico(prefijo = 'auth') {
  return `${prefijo}-${randomUUID()}@trender.com`;
}

describe('Autenticación', () => {
  afterAll(() => {
    try {
      cerrarDb();
    } finally {
      fs.rmSync(dbPath, { force: true });
    }
  });

  it('solicita un código válido y responde 200', async () => {
    const res = await request(app)
      .post('/api/auth/solicitar-codigo')
      .send({ email: emailUnico() });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  it('rechaza una solicitud con email inválido', async () => {
    const res = await request(app)
      .post('/api/auth/solicitar-codigo')
      .send({ email: 'no-es-email' });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((error) => error.field === 'email')).toBe(true);
  });

  it('verifica únicamente el código 123456', async () => {
    const email = emailUnico('otp');

    const invalido = await request(app)
      .post('/api/auth/verificar-codigo')
      .send({ email, codigo: '000000' });

    expect(invalido.status).toBe(401);

    const valido = await request(app)
      .post('/api/auth/verificar-codigo')
      .send({ email, codigo: '123456' });

    expect(valido.status).toBe(200);
    expect(valido.body.token).toEqual(expect.any(String));
    expect(valido.body.user.email).toBe(email);
  });

  it('registra un usuario, evita duplicados y permite iniciar sesión', async () => {
    const email = emailUnico('password');
    const password = 'secreto-seguro-123';

    const registro = await request(app)
      .post('/api/auth/registro')
      .send({ nombre: 'Estudio Trender', email, password });

    expect(registro.status).toBe(201);
    expect(registro.body.token).toEqual(expect.any(String));
    expect(registro.body.user.nombre).toBe('Estudio Trender');
    expect(registro.body.user.password_hash).toBeUndefined();

    const duplicado = await request(app)
      .post('/api/auth/registro')
      .send({ nombre: 'Otro Nombre', email, password });

    expect(duplicado.status).toBe(409);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    expect(login.status).toBe(200);
    expect(login.body.user.nombre).toBe('Estudio Trender');
  });

  it('rechaza credenciales incorrectas y contraseñas cortas', async () => {
    const email = emailUnico('login');
    const password = 'secreto-seguro-123';

    await request(app)
      .post('/api/auth/registro')
      .send({ nombre: 'Usuario Login', email, password });

    const incorrecto = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'otra-clave' });

    expect(incorrecto.status).toBe(401);

    const corta = await request(app)
      .post('/api/auth/registro')
      .send({ nombre: 'Usuario Corta', email: emailUnico('corta'), password: '123' });

    expect(corta.status).toBe(400);
    expect(corta.body.errors.some((error) => error.field === 'password')).toBe(true);
  });

  it('exige nombre al registrar una cuenta', async () => {
    const res = await request(app)
      .post('/api/auth/registro')
      .send({ email: emailUnico('sin-nombre'), password: 'secreto-seguro-123' });

    expect(res.status).toBe(400);
    expect(res.body.errors.some((error) => error.field === 'nombre')).toBe(true);
  });

  it('devuelve el perfil con un token válido y 401 sin token', async () => {
    const email = emailUnico('me');

    const sesion = await request(app)
      .post('/api/auth/verificar-codigo')
      .send({ email, codigo: '123456' });

    const perfil = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${sesion.body.token}`);

    expect(perfil.status).toBe(200);
    expect(perfil.body.user.email).toBe(email);
    expect(perfil.body.user.nombre).toEqual(expect.any(String));

    const sinToken = await request(app).get('/api/auth/me');

    expect(sinToken.status).toBe(401);
  });
});
