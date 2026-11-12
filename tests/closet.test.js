const fs = require('fs');
const request = require('supertest');
const app = require('../src/app');
const { UPLOADS_DIR } = require('../src/servicios/closet.service');
const { crearUsuario } = require('./helpers');
const { fotoPrenda } = require('./siluetas-prueba');

jest.setTimeout(30000);
beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterAll(() => {
  jest.restoreAllMocks();
  fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
});

describe('Armario /api/closet', () => {
  let ana;
  let beto;

  beforeAll(async () => {
    ana = await crearUsuario(app, 'ana');
    beto = await crearUsuario(app, 'beto');
  });

  /** Consulta la prenda hasta que termine su análisis, como hace el frontend. */
  async function esperar(auth, id) {
    for (let i = 0; i < 200; i += 1) {
      const res = await request(app).get(`/api/closet/${id}`).set(auth);
      if (res.body.data.status !== 'processing') return res.body.data;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('no terminó');
  }

  async function subir(usuario, forma, query = {}) {
    const res = await request(app).post('/api/closet/subir').query(query).set(usuario.auth).set('Content-Type', 'image/jpeg').send(await fotoPrenda(forma));
    return { res, prenda: res.status === 202 ? await esperar(usuario.auth, res.body.data.id) : null };
  }

  it('sube una foto: 202 "processing" y luego "ready", sin exponer datos internos', async () => {
    const { res, prenda } = await subir(ana, 'camiseta', { genero: 'Femenino' });
    expect(res.status).toBe(202);
    expect(res.headers.location).toBe(`/api/closet/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({ status: 'processing', source_url: null });
    expect(res.body.data).not.toHaveProperty('user_id');
    expect(prenda).toMatchObject({ status: 'ready', category: 'top', tipo: 'camiseta', genero: 'Femenino', ajustes: null });
  });

  it('valida categoría, género y tipo', async () => {
    for (const query of [{ genero: 'Otro' }, { category: 'gorros' }, { tipo: 'capa' }]) {
      expect((await subir(ana, 'falda', query)).res.status).toBe(400);
    }
  });

  it('la misma foto puede estar en otro armario (otro usuario u otro apartado)', async () => {
    expect((await subir(beto, 'camiseta')).res.status).toBe(202);
    expect((await subir(ana, 'camiseta', { genero: 'Masculino' })).res.status).toBe(202);
  });

  it('lista solo las prendas del usuario y filtra por categoría y género', async () => {
    await subir(ana, 'pantalon', { genero: 'Femenino' });
    const todas = await request(app).get('/api/closet').set(ana.auth);
    expect(todas.body.data.count).toBe(3);
    const inferiores = await request(app).get('/api/closet').query({ category: 'bottom' }).set(ana.auth);
    expect(inferiores.body.data.items.map((p) => p.tipo)).toEqual(['pantalon']);
    const hombre = await request(app).get('/api/closet').query({ genero: 'Masculino' }).set(ana.auth);
    expect(hombre.body.data.count).toBe(1);
    expect((await request(app).get('/api/closet').query({ category: 'x' }).set(ana.auth)).status).toBe(400);
  });

  it('aislamiento: otro usuario no puede leer, modificar ni borrar la prenda (404)', async () => {
    const { prenda } = await subir(ana, 'vestido');
    expect((await request(app).get(`/api/closet/${prenda.id}`).set(beto.auth)).status).toBe(404);
    expect((await request(app).patch(`/api/closet/${prenda.id}`).set(beto.auth).send({ category: 'top' })).status).toBe(404);
    expect((await request(app).delete(`/api/closet/${prenda.id}`).set(beto.auth)).status).toBe(404);
    expect((await request(app).get('/api/closet/no-es-uuid').set(ana.auth)).status).toBe(400);
  });

  it('actualiza la categoría y elimina; la caché se invalida en cada cambio', async () => {
    const { prenda } = await subir(beto, 'short');
    await request(app).get('/api/closet').set(beto.auth); // llena la caché
    const res = await request(app).patch(`/api/closet/${prenda.id}`).set(beto.auth).send({ category: 'bottom', tipo: 'jeans' });
    expect(res.body.data).toMatchObject({ category: 'bottom', tipo: 'jeans' });
    let lista = await request(app).get('/api/closet').set(beto.auth);
    expect(lista.body.data.items.find((p) => p.id === prenda.id).tipo).toBe('jeans');
    expect((await request(app).delete(`/api/closet/${prenda.id}`).set(beto.auth)).body.data).toEqual({ id: prenda.id, deleted: true });
    lista = await request(app).get('/api/closet').set(beto.auth);
    expect(lista.body.data.items.some((p) => p.id === prenda.id)).toBe(false);
  });

  it('sin sesión responde 401', async () => {
    expect((await request(app).get('/api/closet')).status).toBe(401);
  });
});
