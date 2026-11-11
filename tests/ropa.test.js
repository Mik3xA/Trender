const http = require('http');
const request = require('supertest');
const app = require('../src/app');
const { clasificar, detectarColor, formatearPrecio, escanearUrl } = require('../src/servicios/ropa.service');
const { extraerMetadatos, obtenerHtml } = require('../src/servicios/pagina.service');

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

describe('extraerMetadatos', () => {
  it('lee Product y BreadcrumbList de JSON-LD (incluido @graph)', () => {
    const html = `
      <html><head>
        <title>Tienda | Inicio</title>
        <meta property="og:title" content="Título OG">
        <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
          {"@type":"BreadcrumbList","itemListElement":[{"name":"Hombre"},{"item":{"name":"Pantalones"}}]},
          {"@type":"Product","name":"Pantal&oacute;n Chino Slim","category":"Pantalones","color":"Beige",
           "image":["https://cdn.example/p.jpg"],"brand":{"name":"Marca"},
           "offers":{"price":"899.00","priceCurrency":"MXN"}}]}</script>
        <script type="application/ld+json">{ roto </script>
      </head></html>`;
    expect(extraerMetadatos(html)).toMatchObject({
      titulo: 'Pantalón Chino Slim',
      categoria: 'Pantalones',
      migas: ['Hombre', 'Pantalones'],
      imagen: 'https://cdn.example/p.jpg',
      precio: '899.00',
      moneda: 'MXN',
      marca: 'Marca',
      color: 'Beige',
    });
  });

  it('usa meta tags y <title> si no hay JSON-LD', () => {
    const html = `<title>Sudadera &amp; Hoodie</title>
      <meta content="https://cdn.example/s.jpg" property="og:image">
      <meta property="product:price:amount" content="650"><meta property="product:price:currency" content="MXN">`;
    expect(extraerMetadatos(html)).toMatchObject({
      titulo: 'Sudadera & Hoodie',
      imagen: 'https://cdn.example/s.jpg',
      precio: '650',
      moneda: 'MXN',
    });
  });
});

describe('obtenerHtml', () => {
  let servidor;
  let base;

  beforeAll(async () => {
    servidor = http.createServer((req, res) => {
      if (req.url === '/redirige') {
        res.writeHead(302, { Location: '/producto' });
        return res.end();
      }
      if (req.url === '/imagen') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        return res.end('png');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<title>Jeans Recto</title>');
    });
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${servidor.address().port}`;
  });

  afterAll(() => new Promise((r) => servidor.close(r)));

  it('bloquea servidores de la red interna (SSRF)', async () => {
    await expect(obtenerHtml(`${base}/producto`)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('sigue redirecciones y descarta lo que no es HTML', async () => {
    const opciones = { permitirRedesPrivadas: true };
    await expect(obtenerHtml(`${base}/redirige`, opciones)).resolves.toMatchObject({
      url: `${base}/producto`,
      html: '<title>Jeans Recto</title>',
    });
    await expect(obtenerHtml(`${base}/imagen`, opciones)).rejects.toMatchObject({ statusCode: 415 });
  });
});

describe('escanearUrl leyendo la página', () => {
  it('usa el título y la categoría de la tienda aunque la URL no diga nada', async () => {
    const pagina = require('../src/servicios/pagina.service');
    const espia = jest.spyOn(pagina, 'obtenerHtml').mockResolvedValue({
      url: 'https://www2.hm.com/es_mx/productpage.1234567001.html',
      html: `<script type="application/ld+json">{"@type":"Product","name":"Pantalón jogger negro",
        "category":"Pantalones","offers":{"price":"599","priceCurrency":"MXN"},"image":"https://img.example/j.jpg"}</script>`,
    });
    const prenda = await escanearUrl('https://www2.hm.com/es_mx/productpage.1234567001.html', { leerPagina: true });
    espia.mockRestore();

    expect(prenda).toMatchObject({
      nombre: 'Pantalón jogger negro',
      categoria: 'Piernas',
      tipo: 'jogger',
      color: { nombre: 'negro' },
      precio: '$599 MXN',
      imagen: 'https://img.example/j.jpg',
      tienda: 'hm.com',
      fuente: 'pagina',
      motivo: null,
    });
  });

  it('si la página no responde, analiza solo la URL', async () => {
    const pagina = require('../src/servicios/pagina.service');
    const espia = jest.spyOn(pagina, 'obtenerHtml').mockRejectedValue(new Error('sin red'));
    const prenda = await escanearUrl('https://tienda.example/sweatpants-gris', { leerPagina: true });
    espia.mockRestore();
    expect(prenda).toMatchObject({ categoria: 'Piernas', fuente: 'url', color: { nombre: 'gris' } });
  });
});

describe('POST /api/ropa/escanear-link', () => {
  it('escanea sin sesión y devuelve la prenda detectada', async () => {
    const res = await escanear('https://www.zara.com/mx/es/pantalon-recto-negro-p01234.html');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.prenda).toMatchObject({
      id: expect.stringMatching(/^scanned_/),
      categoria: 'Piernas',
      tipo: 'pantalon',
      confianza: expect.any(String),
      color: { nombre: 'negro', hex: '#1d1d1f' },
      tienda: 'zara.com',
      fuente: 'url',
    });
  });

  it('arma un nombre legible desde la URL sin códigos de producto', async () => {
    const res = await escanear('https://tienda.example/es/jeans-rectos-azul-p01.html');
    expect(res.body.data.prenda.nombre).toBe('Jeans rectos azul');
  });

  it('responde categoria null con un motivo cuando no reconoce la prenda', async () => {
    const res = await escanear('https://tienda.example/producto-generico');
    expect(res.status).toBe(200);
    expect(res.body.data.prenda).toMatchObject({ categoria: null, motivo: expect.stringContaining('Elige la categoría') });
  });

  it.each([[''], ['   '], [undefined], [42]])('responde 400 si la URL es %p', async (url) => {
    const res = await request(app).post('/api/ropa/escanear-link').send(url === undefined ? {} : { url });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'url' && e.message === 'La URL es requerida')).toBe(true);
  });

  it.each(['http://localhost:8080/x', 'http://192.168.1.10/pantalon', 'ftp://tienda.example/x', 'no es url'])(
    'rechaza URLs internas o inválidas: %s',
    async (url) => {
      expect((await escanear(url)).status).toBe(400);
    }
  );
});
