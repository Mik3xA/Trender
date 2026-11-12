const http = require('http');
const request = require('supertest');
const app = require('../src/app');
const { clasificar, detectarColor, formatearPrecio } = require('../src/servicios/ropa.service');

const escanear = (url) => request(app).post('/api/ropa/escanear-link').send({ url });

beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterAll(() => jest.restoreAllMocks());

describe('clasificar (palabras de la URL)', () => {
  it.each([
    // Piernas: incluye los casos que antes salían como "prenda superior"
    ['https://shop.example/Men-Drawstring-Waist-Sweatpants-p-12345.html', 'Piernas', 'jogger'],
    ['https://shop.example/es/pants-cargo-hombre', 'Piernas', 'pantalon'],
    ['https://tienda.example/pantalón-de-mezclilla', 'Piernas', 'pantalon'],
    ['https://tienda.example/pantalones-wide-leg-p0123.html', 'Piernas', 'pantalon'],
    ['https://tienda.example/jeans-skinny?color=azul', 'Piernas', 'jeans'],
    ['https://tienda.example/WomenTrousers/linen', 'Piernas', 'pantalon'],
    ['https://tienda.example/minifalda-plisada', 'Piernas', 'falda'],
    ['https://tienda.example/shorts-de-lino', 'Piernas', 'short'],
    ['https://tienda.example/leggings-deportivos', 'Piernas', 'leggings'],
    // Calzado
    ['https://tienda.example/tenis-air-max', 'Calzado', 'tenis'],
    ['https://tienda.example/botas-chelsea-cuero', 'Calzado', 'botas'],
    ['https://tienda.example/zapatos/negros', 'Calzado', 'zapatos'],
    // Torso y vestidos
    ['https://tienda.example/camisa-oxford-slim', 'Torso', 'camisa'],
    ['https://tienda.example/t-shirt-basic', 'Torso', 'camiseta'],
    ['https://tienda.example/hoodie-oversize', 'Torso', 'sudadera'],
    ['https://tienda.example/crop-top-negro', 'Torso', 'top'],
    ['https://tienda.example/vestido-midi-satinado', 'Vestido', 'vestido'],
  ])('%s -> %s (%s)', (url, categoria, tipo) => {
    expect(clasificar({ url })).toMatchObject({ categoria, tipo });
  });

  it.each([
    'https://tienda.example/producto-generico',
    'https://www2.hm.com/es_mx/productpage.1234567001.html',
    'https://tienda.example/participants/shortcut',
  ])('no adivina cuando no hay evidencia: %s', (url) => {
    expect(clasificar({ url })).toMatchObject({ categoria: null, confianza: 'ninguna' });
  });

  it('el título manda sobre la URL y la primera prenda nombrada gana', () => {
    expect(clasificar({ url: 'https://x.example/p/889', titulo: 'Pantalón cargo para combinar con camisa' }))
      .toMatchObject({ categoria: 'Piernas', tipo: 'pantalon' });
    expect(clasificar({ titulo: 'Short Sleeve Oxford Shirt' })).toMatchObject({ categoria: 'Torso', tipo: 'camisa' });
    expect(clasificar({ titulo: 'Polo Ralph Lauren Pantalón chino' })).toMatchObject({ categoria: 'Piernas' });
    expect(clasificar({ categoria: 'Hombre > Ropa > Pantalones', titulo: 'Modelo 9921' }))
      .toMatchObject({ categoria: 'Piernas', confianza: 'media' });
  });

  it('reconoce accesorios y no los viste', () => {
    expect(clasificar({ titulo: 'Cinturón de piel para pantalón' })).toMatchObject({ categoria: null, accesorio: 'cinturon' });
    expect(clasificar({ url: 'https://x.example/gorra-beisbolera' })).toMatchObject({ categoria: null });
  });

  it('da confianza alta cuando varias fuentes coinciden', () => {
    expect(
      clasificar({ categoria: 'Jeans', titulo: 'Jeans 501 Original', url: 'https://x.example/jeans-501' })
    ).toMatchObject({ tipo: 'jeans', confianza: 'alta' });
  });
});

describe('color y precio', () => {
  it('detecta colores en español e inglés (azul marino antes que azul)', () => {
    expect(detectarColor('Sudadera Azul Marino')).toEqual({ nombre: 'azul marino', hex: '#1f2a44' });
    expect(detectarColor('Black Hoodie')).toMatchObject({ nombre: 'negro' });
    expect(detectarColor('Prenda sin color')).toBeNull();
  });

  it('formatea precios reales y descarta valores vacíos', () => {
    expect(formatearPrecio('1299', 'mxn')).toBe('$1,299 MXN');
    expect(formatearPrecio(49.9, 'USD')).toBe('$49.90 USD');
    expect(formatearPrecio(null)).toBeNull();
  });
});
