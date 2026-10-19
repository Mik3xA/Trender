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
    expect(['Torso', 'Piernas', 'Calzado']).toContain(res.body.prenda.categoria);
    expect(res.body.prenda.imagenUrl).toMatch(/^\/ropa\/.+\.png$/);
  });

  it('debe detectar calzado por palabras clave', async () => {
    const res = await request(app)
      .post('/api/ropa/escanear-link')
      .send({ url: 'https://tienda.example/tenis-sneakers' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.prenda.categoria).toBe('Calzado');
    expect(res.body.prenda.nombre).toBe('Calzado Deportivo/Casual');
  });

  it('debe detectar piernas y normalizar diacríticos', async () => {
    const res = await request(app)
      .post('/api/ropa/escanear-link')
      .send({ url: 'https://tienda.example/pantalón-de-mezclilla' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.prenda.categoria).toBe('Piernas');
    expect(res.body.prenda.nombre).toBe('Pantalón / Short');
  });

  it('debe detectar torso por palabra clave y usar el fallback torso', async () => {
    const keywordResponse = await request(app)
      .post('/api/ropa/escanear-link')
      .send({ url: 'https://tienda.example/camisa-satinada' });

    const fallbackResponse = await request(app)
      .post('/api/ropa/escanear-link')
      .send({ url: 'https://tienda.example/producto-generico' });

    expect(keywordResponse.status).toBe(200);
    expect(keywordResponse.body.prenda.categoria).toBe('Torso');
    expect(keywordResponse.body.prenda.nombre).toBe('Prenda Superior');
    expect(fallbackResponse.status).toBe(200);
    expect(fallbackResponse.body.prenda.categoria).toBe('Torso');
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

});
