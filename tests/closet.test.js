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

  it('agrega una prenda por link, en estado pending y con carpeta preparada', async () => {
    const res = await request(app)
      .post('/api/closet/add-from-link')
      .set(ana.auth)
      .send({ url: 'https://shop.example.com/camisa-lino#fotos', category: 'top' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      id: expect.any(String),
      source_url: 'https://shop.example.com/camisa-lino',
      category: 'top',
      status: 'pending',
    });
    expect(res.body.data).not.toHaveProperty('user_id');
    expect(fs.existsSync(path.join(UPLOADS_DIR, path.dirname(res.body.data.image_path)))).toBe(true);
  });

  it('valida url y categoría', async () => {
    const res = await request(app).post('/api/closet/add-from-link').set(ana.auth).send({ url: 'nada', category: 'hat' });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field).sort()).toEqual(['category', 'url']);

    const interna = await request(app)
      .post('/api/closet/add-from-link')
      .set(ana.auth)
      .send({ url: 'http://169.254.169.254/latest', category: 'top' });
    expect(interna.status).toBe(400);
  });

  it('no duplica el mismo link para un usuario, pero otro usuario sí puede guardarlo', async () => {
    const url = 'https://shop.example.com/zapatilla';
    expect((await request(app).post('/api/closet/add-from-link').set(ana.auth).send({ url, category: 'shoes' })).status).toBe(201);
    const repetida = await request(app).post('/api/closet/add-from-link').set(ana.auth).send({ url, category: 'shoes' });
    expect(repetida.status).toBe(409);
    expect((await request(app).post('/api/closet/add-from-link').set(beto.auth).send({ url, category: 'shoes' })).status).toBe(201);
  });

  it('lista solo las prendas del usuario y filtra por categoría', async () => {
    const todas = await request(app).get('/api/closet').set(ana.auth);
    expect(todas.status).toBe(200);
    expect(todas.body.data.count).toBe(2);
    expect(todas.headers['cache-control']).toBe('no-store');

    const zapatos = await request(app).get('/api/closet?category=shoes').set(ana.auth);
    expect(zapatos.body.data.items.map((i) => i.category)).toEqual(['shoes']);

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
    const creada = await request(app)
      .post('/api/closet/add-from-link')
      .set(ana.auth)
      .send({ url: 'https://shop.example.com/pantalon', category: 'top' });
    const id = creada.body.data.id;

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
