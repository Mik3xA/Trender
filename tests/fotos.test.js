const fs = require('fs');
const request = require('supertest');
const sharp = require('sharp');

const app = require('../src/app');
const pagina = require('../src/servicios/pagina.service');
const scraper = require('../src/servicios/scraper.service');
const closet = require('../src/servicios/closet.service');
const { fotoPrenda } = require('./siluetas-prueba');

async function invitado() {
  const res = await request(app).post('/api/auth/invitado');
  return { Authorization: `Bearer ${res.body.data.token}` };
}

async function esperar(auth, id) {
  for (let i = 0; i < 200; i += 1) {
    const res = await request(app).get(`/api/closet/${id}`).set(auth);
    if (res.body.data.status !== 'processing') return res.body.data;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error('el análisis no terminó');
}

const subir = (auth, foto, query = {}, tipo = 'image/jpeg') =>
  request(app).post('/api/closet/subir').query(query).set(auth).set('Content-Type', tipo).send(foto);

jest.setTimeout(30000);
afterEach(() => jest.restoreAllMocks());
afterAll(() => fs.rmSync(closet.UPLOADS_DIR, { recursive: true, force: true }));

describe('POST /api/closet/subir (fotos de prendas)', () => {
  it('202 y analiza la foto: camiseta de manga corta, recortada y guardada en el armario', async () => {
    const auth = await invitado();
    const res = await subir(auth, await fotoPrenda('camiseta', { fondo: 'casa' }), { genero: 'Masculino' });
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ status: 'processing', genero: 'Masculino' });

    const prenda = await esperar(auth, res.body.data.id);
    expect(prenda).toMatchObject({ status: 'ready', category: 'top', tipo: 'camiseta', nombre: 'Camiseta rojo' });
    expect(prenda.imagen_url).toMatch(/^\/media\/closet\/.+\.png$/);
    expect(prenda.analisis).toMatchObject({ origen: 'foto subida', metodoRecorte: 'recorte-tolerante' });
    expect(prenda.analisis.visual.detalle).toMatchObject({ manga: 'corta' });
    expect(prenda.analisis.visual.zonas.torso).toBeDefined();

    // Queda guardada: aparece en el armario de su apartado y el recorte tiene transparencia.
    const lista = await request(app).get('/api/closet').query({ genero: 'Masculino' }).set(auth);
    expect(lista.body.data.items.map((p) => p.id)).toContain(prenda.id);
    const png = await request(app).get(prenda.imagen_url);
    expect((await sharp(png.body).metadata()).hasAlpha).toBe(true);
  });

  it.each([
    ['pantalon', 'bottom', 'pantalon'],
    ['short', 'bottom', 'short'],
    ['falda', 'bottom', 'falda'],
    ['vestido', 'dress', 'vestido'],
    ['tenis', 'shoes', 'tenis'],
    ['bota', 'shoes', 'botas'],
  ])('detecta %s solo con la imagen', async (forma, category, tipo) => {
    const auth = await invitado();
    const res = await subir(auth, await fotoPrenda(forma, { formato: 'png' }), {}, 'image/png');
    expect(await esperar(auth, res.body.data.id)).toMatchObject({ category, tipo });
  });

  it('el nombre escrito por el usuario ayuda y se respeta', async () => {
    const auth = await invitado();
    const res = await subir(auth, await fotoPrenda('pantalon'), { nombre: 'Jeans favoritos' });
    expect(await esperar(auth, res.body.data.id)).toMatchObject({ status: 'ready', category: 'bottom', tipo: 'jeans', nombre: 'Jeans favoritos' });
  });

  it('la misma foto dos veces en el mismo apartado es 409', async () => {
    const auth = await invitado();
    const foto = await fotoPrenda('falda');
    expect((await subir(auth, foto)).status).toBe(202);
    const repetida = await subir(auth, foto);
    expect(repetida.status).toBe(409);
    expect(repetida.body.code).toBe('PRENDA_DUPLICADA');
  });

  it('valida antes de analizar: sin imagen, tipo incorrecto o parámetros inválidos -> 400', async () => {
    const auth = await invitado();
    expect((await request(app).post('/api/closet/subir').set(auth)).status).toBe(400);
    expect((await subir(auth, 'hola', {}, 'text/plain')).status).toBe(400);
    expect((await subir(auth, await fotoPrenda('falda'), { genero: 'Otro' })).status).toBe(400);
  });

  it('rechaza archivos que no son imagen (415) y fotos diminutas (422)', async () => {
    const auth = await invitado();
    expect((await subir(auth, Buffer.from('no soy una imagen'), {}, 'image/png')).status).toBe(415);
    const mini = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#f00' } }).png().toBuffer();
    expect((await subir(auth, mini, {}, 'image/png')).status).toBe(422);
  });

  it('requiere sesión', async () => {
    expect((await subir({}, await fotoPrenda('falda'))).status).toBe(401);
  });
});

describe('links que no se pueden leer', () => {
  it('un link directo a una imagen se analiza como foto', async () => {
    const auth = await invitado();
    const espia = jest.spyOn(scraper, 'extraerProducto');
    jest.spyOn(pagina, 'obtenerImagen').mockResolvedValue({ url: 'x', buffer: await fotoPrenda('pantalon'), tipo: 'image/jpeg' });
    const res = await request(app).post('/api/closet/importar').set(auth).send({ url: 'https://cdn.tienda.example/fotos/pantalon-recto.jpg' });
    expect(await esperar(auth, res.body.data.id)).toMatchObject({ status: 'ready', category: 'bottom' });
    expect(espia).not.toHaveBeenCalled();
  });

  it('si la tienda bloquea la página, la prenda se guarda con el link y se le puede añadir una foto', async () => {
    const auth = await invitado();
    jest.spyOn(scraper, 'extraerProducto').mockImplementation(async (url) => ({ url, tienda: 'zara', imagenes: [], metodo: 'url', bloqueado: true }));
    const res = await request(app).post('/api/closet/importar').set(auth).send({ url: 'https://www.zara.com/mx/es/pantalon-recto-p1.html' });
    const sinFoto = await esperar(auth, res.body.data.id);
    expect(sinFoto).toMatchObject({ imagen_url: null, tienda: 'zara', category: 'bottom' });
    expect(sinFoto.analisis.sinFoto).toBe(true);
    expect(sinFoto.analisis.avisos.join(' ')).toMatch(/bloqueó.*Añade una foto/);

    const conFoto = await request(app).post(`/api/closet/${sinFoto.id}/foto`).set(auth).set('Content-Type', 'image/jpeg').send(await fotoPrenda('pantalon'));
    expect(conFoto.status).toBe(202);
    const lista = await esperar(auth, sinFoto.id);
    expect(lista).toMatchObject({ status: 'ready', category: 'bottom', tienda: 'zara', nombre: sinFoto.nombre });
    expect(lista.imagen_url).toMatch(/\.png$/);
  });

  it('añadir foto a una prenda ajena es 404 y sin imagen es 400', async () => {
    const [a, b] = [await invitado(), await invitado()];
    const res = await subir(a, await fotoPrenda('falda'));
    await esperar(a, res.body.data.id);
    const ajena = await request(app).post(`/api/closet/${res.body.data.id}/foto`).set(b).set('Content-Type', 'image/jpeg').send(await fotoPrenda('falda'));
    expect(ajena.status).toBe(404);
    expect((await request(app).post(`/api/closet/${res.body.data.id}/foto`).set(a)).status).toBe(400);
  });
});
