const request = require('supertest');
const app = require('../src/app');
const cache = require('../src/servicios/cache.service');
const { crearUsuario } = require('./helpers');

beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterAll(() => jest.restoreAllMocks());

describe('Autenticación /api/auth', () => {
  it('registra, devuelve JWT y crea un perfil vacío', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'Nueva@Trender.test', password: 'clave-segura-123' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.user).toEqual({
      id: expect.any(String),
      nombre: 'Nueva',
      email: 'nueva@trender.test',
      created_at: expect.any(String),
    });
    expect(res.body.data.token.split('.')).toHaveLength(3);
    expect(res.body.data).not.toHaveProperty('user.password_hash');

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.data.token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.profile).toMatchObject({ altura: null, avatar_config: {} });
  });

  it('guarda el nombre enviado en el registro y lo devuelve en /me', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ nombre: 'Michael R.', email: 'michael@trender.test', password: 'clave-segura-123' });
    expect(res.status).toBe(201);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.data.token}`);
    expect(me.body.data.user.nombre).toBe('Michael R.');
  });

  it('ya no existe el acceso por código fijo (OTP de demostración)', async () => {
    const res = await request(app).post('/api/auth/verificar-codigo').send({ email: 'x@trender.test', codigo: '123456' });
    expect(res.status).toBe(404);
  });

  it('valida el payload del registro (400, sin ejecutar el controlador)', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'no-es-email', password: 'corta' });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field).sort()).toEqual(['email', 'password']);
  });

  it('rechaza un email ya registrado con 409', async () => {
    const { email } = await crearUsuario(app);
    const res = await request(app).post('/api/auth/register').send({ email: email.toUpperCase(), password: 'clave-segura-123' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_EN_USO');
  });

  it('inicia sesión y responde igual a email inexistente o contraseña errónea', async () => {
    const { email } = await crearUsuario(app);
    const ok = await request(app).post('/api/auth/login').send({ email, password: 'clave-segura-123' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.token).toBeTruthy();

    const malaClave = await request(app).post('/api/auth/login').send({ email, password: 'incorrecta-123' });
    const sinCuenta = await request(app).post('/api/auth/login').send({ email: 'nadie@trender.test', password: 'incorrecta-123' });
    expect(malaClave.status).toBe(401);
    expect(sinCuenta.status).toBe(401);
    expect(malaClave.body.error).toBe(sinCuenta.body.error);
  });

  it('protege las rutas privadas', async () => {
    expect((await request(app).get('/api/closet')).status).toBe(401);
    expect((await request(app).get('/api/closet').set('Authorization', 'Bearer basura')).status).toBe(401);
    expect((await request(app).get('/api/profile').set('Authorization', 'Token abc')).status).toBe(401);
  });

  it('logout revoca solo esa sesión y limpia la caché del usuario', async () => {
    const usuario = await crearUsuario(app);
    const otraSesion = await request(app).post('/api/auth/login').send({ email: usuario.email, password: 'clave-segura-123' });

    await request(app).get('/api/closet').set(usuario.auth); // llena la caché
    expect(cache.tamanoUsuario(usuario.user.id)).toBeGreaterThan(0);

    const salida = await request(app).post('/api/auth/logout').set(usuario.auth);
    expect(salida.status).toBe(200);
    expect(salida.body.data).toEqual({ revoked: true });
    expect(cache.tamanoUsuario(usuario.user.id)).toBe(0);

    const reutilizado = await request(app).get('/api/closet').set(usuario.auth);
    expect(reutilizado.status).toBe(401);
    expect(reutilizado.body.code).toBe('SESION_REVOCADA');
    expect((await request(app).post('/api/auth/logout').set(usuario.auth)).status).toBe(401);

    const sigueActiva = await request(app).get('/api/closet').set('Authorization', `Bearer ${otraSesion.body.data.token}`);
    expect(sigueActiva.status).toBe(200);
  });

  it('responde 400 JSON ante un cuerpo mal formado', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });
});

describe('Perfil /api/profile', () => {
  it('guarda medidas y avatar_config del usuario autenticado', async () => {
    const { auth } = await crearUsuario(app);
    const res = await request(app)
      .put('/api/profile')
      .set(auth)
      .send({ altura: 172, pecho: 94, cintura: 78, cadera: 98, avatar_config: { skin: '#c9a27e' } });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ altura: 172, pecho: 94, cintura: 78, cadera: 98, avatar_config: { skin: '#c9a27e' } });
    expect((await request(app).get('/api/profile').set(auth)).body.data.altura).toBe(172);
  });

  it('rechaza medidas fuera de rango', async () => {
    const { auth } = await crearUsuario(app);
    const res = await request(app).put('/api/profile').set(auth).send({ altura: 900, pecho: 'mucho' });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field).sort()).toEqual(['altura', 'pecho']);
  });
});
