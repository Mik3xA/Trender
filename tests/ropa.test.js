const request = require('supertest');
const app = require('../src/app');

const escanear = (url) => request(app).post('/api/ropa/escanear-link').send({ url });

describe('POST /api/ropa/escanear-link', () => {
  beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterAll(() => jest.restoreAllMocks());

  it('escanea una URL válida sin sesión y devuelve la prenda', async () => {
    const res = await escanear('https://www.zara.com/mx/producto-ejemplo');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    const { prenda } = res.body.data;
    expect(prenda.id).toMatch(/^scanned_/);
    expect(prenda.nombre).toBeTruthy();
    expect(prenda.precio).toBeTruthy();
    expect(['Torso', 'Piernas', 'Calzado']).toContain(prenda.categoria);
    expect(prenda.imagenUrl).toMatch(/^\/ropa\/.+\.png$/);
  });

  it.each([
    ['https://tienda.example/tenis-sneakers', 'Calzado'],
    ['https://tienda.example/zapatos/negros', 'Calzado'],
    ['https://tienda.example/pantalón-de-mezclilla', 'Piernas'],
    ['https://tienda.example/pantalones-cargo', 'Piernas'],
    ['https://tienda.example/jeans?color=azul', 'Piernas'],
    ['https://tienda.example/camisa-satinada', 'Torso'],
    ['https://tienda.example/crop-top-negro', 'Torso'],
    ['https://tienda.example/producto-generico', 'Torso'],
  ])('%s -> %s', async (url, categoria) => {
    const res = await escanear(url);
    expect(res.body.data.prenda.categoria).toBe(categoria);
  });

  it('no confunde palabras que solo contienen la keyword', async () => {
    expect((await escanear('https://tienda.example/shortcut/camisa')).body.data.prenda.categoria).toBe('Torso');
    expect((await escanear('https://tienda.example/participants-blusa')).body.data.prenda.categoria).toBe('Torso');
    expect((await escanear('https://topshop.example/jeans')).body.data.prenda.categoria).toBe('Piernas');
  });

  it.each([[''], ['   '], [undefined], [42]])('responde 400 si la URL es %p', async (url) => {
    const res = await request(app).post('/api/ropa/escanear-link').send(url === undefined ? {} : { url });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'url' && e.message === 'La URL es requerida')).toBe(true);
  });
});
