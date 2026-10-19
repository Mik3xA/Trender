const request = require('supertest');
const app = require('../src/app');

describe('POST /api/ropa/escanear-link', () => {
  it('debe escanear una URL válida y devolver una prenda con éxito 200', async () => {
    const res = await request(app)
      .post('/api/ropa/escanear-link')
      .send({ url: 'https://www.zara.com/mx/producto-ejemplo' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.prenda).toBeDefined();
    expect(res.body.prenda.id).toMatch(/^scanned_/);
    expect(res.body.prenda.nombre).toBeTruthy();
    expect(res.body.prenda.precio).toBeTruthy();
    expect(['Torso', 'Piernas']).toContain(res.body.prenda.categoria);
    expect(res.body.prenda.imagenUrl).toMatch(/^https?:\/\//);
  });

  it('debe detectar marca conocida en la URL (Zara)', async () => {
    const res = await request(app)
      .post('/api/ropa/escanear-link')
      .send({ url: 'https://www.zara.com/blazer-estructurado' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.prenda.nombre).toBeTruthy();
  });

  it('debe detectar marca conocida en la URL (Shein)', async () => {
    const res = await request(app)
      .post('/api/ropa/escanear-link')
      .send({ url: 'https://www.shein.com/blusa-satinada' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('debe devolver 400 si la URL está vacía', async () => {
    const res = await request(app)
      .post('/api/ropa/escanear-link')
      .send({ url: '' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors.some(e => e.field === 'url' && e.message === 'La URL es requerida')).toBe(true);
  });

  it('debe devolver 400 si no se envía URL', async () => {
    const res = await request(app)
      .post('/api/ropa/escanear-link')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('debe devolver 400 si la URL es solo espacios', async () => {
    const res = await request(app)
      .post('/api/ropa/escanear-link')
      .send({ url: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('debe usar fallback para marcas desconocidas', async () => {
    const res = await request(app)
      .post('/api/ropa/escanear-link')
      .send({ url: 'https://tienda-desconocida.com/producto' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.prenda.id).toMatch(/^scanned_/);
  });
});