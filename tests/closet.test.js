const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const { UPLOADS_DIR } = require('../src/servicios/closet.service');
const { crearUsuario } = require('./helpers');

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
    for (let i = 0; i < 100; i += 1) {
      const res = await request(app).get(`/api/closet/${id}`).set(auth);
      if (res.body.data.status !== 'processing') return res.body.data;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('no terminó');
  }

  async function importar(usuario, url, extra = {}) {
    const res = await request(app).post('/api/closet/add-from-link').set(usuario.auth).send({ url, ...extra });
    return { res, prenda: res.status === 202 ? await esperar(usuario.auth, res.body.data.id) : null };
  }

  it('importa una prenda por link: 202 "processing" y luego "ready" con categoría y tipo', async () => {
    const { res, prenda } = await importar(ana, 'https://shop.example.com/camisa-lino#fotos', { genero: 'Femenino' });
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ status: 'processing', source_url: 'https://shop.example.com/camisa-lino' });
    expect(res.body.data).not.toHaveProperty('user_id');
    expect(prenda).toMatchObject({ status: 'ready', category: 'top', tipo: 'camisa', genero: 'Femenino' });
  });

  it('deduce la categoría del link (pantalones -> bottom) si no se envía', async () => {
    const { prenda } = await importar(beto, 'https://shop.example.com/pantalones-cargo');
    expect(prenda).toMatchObject({ category: 'bottom', tipo: 'pantalon' });
    await request(app).delete(`/api/closet/${prenda.id}`).set(beto.auth);
  });

  it('respeta la categoría que indica el usuario', async () => {
    const { prenda } = await importar(beto, 'https://shop.example.com/producto/77', { category: 'shoes' });
    expect(prenda).toMatchObject({ status: 'ready', category: 'shoes' });
    await request(app).delete(`/api/closet/${prenda.id}`).set(beto.auth);
  });

  it('si no se puede deducir la categoría queda en revisión', async () => {
    const { prenda } = await importar(beto, 'https://shop.example.com/producto/88231');
    expect(prenda).toMatchObject({ status: 'review', category: null });
    await request(app).delete(`/api/closet/${prenda.id}`).set(beto.auth);
  });

  it('valida url, categoría y género', async () => {
    const res = await request(app).post('/api/closet/importar').set(ana.auth).send({ url: 'nada', category: 'hat', genero: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field).sort()).toEqual(['category', 'genero', 'url']);
    const interna = await request(app).post('/api/closet/importar').set(ana.auth).send({ url: 'http://169.254.169.254/latest' });
    expect(interna.status).toBe(400);
  });

  it('no duplica el mismo link en un armario, pero otro usuario sí puede guardarlo', async () => {
    const url = 'https://shop.example.com/zapatilla';
    expect((await importar(ana, url)).prenda.category).toBe('shoes');
    expect((await request(app).post('/api/closet/importar').set(ana.auth).send({ url })).status).toBe(409);
    expect((await importar(beto, url)).res.status).toBe(202);
  });

  it('lista solo las prendas del usuario y filtra por categoría y género', async () => {
    const todas = await request(app).get('/api/closet').set(ana.auth);
    expect(todas.status).toBe(200);
    expect(todas.body.data.count).toBe(2);
    expect(todas.headers['cache-control']).toBe('no-store');

    const zapatos = await request(app).get('/api/closet?category=shoes').set(ana.auth);
    expect(zapatos.body.data.items.map((i) => i.category)).toEqual(['shoes']);
    expect((await request(app).get('/api/closet?genero=Masculino').set(ana.auth)).body.data.count).toBe(0);

    expect((await request(app).get('/api/closet').set(beto.auth)).body.data.count).toBe(1);
    expect((await request(app).get('/api/closet?category=gorra').set(ana.auth)).status).toBe(400);
  });

  it('aislamiento: otro usuario no puede leer, modificar ni borrar la prenda (404)', async () => {
    const { body } = await request(app).get('/api/closet').set(ana.auth);
    const id = body.data.items[0].id;

    expect((await request(app).get(`/api/closet/${id}`).set(beto.auth)).status).toBe(404);
    expect((await request(app).patch(`/api/closet/${id}`).set(beto.auth).send({ category: 'bottom' })).status).toBe(404);
    expect((await request(app).delete(`/api/closet/${id}`).set(beto.auth)).status).toBe(404);
    expect((await request(app).get(`/api/closet/${id}`).set(ana.auth)).status).toBe(200);
  });

  it('actualiza la categoría y elimina; la caché se invalida en cada cambio', async () => {
    const { prenda: creada } = await importar(ana, 'https://shop.example.com/pantalon', { category: 'top' });
    const id = creada.id;

    const cambiada = await request(app).patch(`/api/closet/${id}`).set(ana.auth).send({ category: 'bottom' });
    expect(cambiada.status).toBe(200);
    expect(cambiada.body.data.category).toBe('bottom');
    expect((await request(app).get('/api/closet?category=bottom').set(ana.auth)).body.data.count).toBe(1);

    const borrada = await request(app).delete(`/api/closet/${id}`).set(ana.auth);
    expect(borrada.body.data).toEqual({ id, deleted: true });
    expect((await request(app).get(`/api/closet/${id}`).set(ana.auth)).status).toBe(404);
    expect((await request(app).get('/api/closet?category=bottom').set(ana.auth)).body.data.count).toBe(0);
  });

  it('rechaza ids que no son UUID', async () => {
    expect((await request(app).delete('/api/closet/../../etc').set(ana.auth)).status).toBe(404);
    expect((await request(app).delete('/api/closet/123').set(ana.auth)).status).toBe(400);
  });
});
