const fs = require('fs');
const request = require('supertest');
const sharp = require('sharp');

const app = require('../src/app');
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

describe('cuestionario de la prenda', () => {
  async function lista(auth, forma = 'sudadera', query = {}) {
    const res = await subir(auth, await fotoPrenda(forma), query);
    return esperar(auth, res.body.data.id);
  }

  it('si el usuario dice qué es antes de subirla, su respuesta manda', async () => {
    const auth = await invitado();
    const prenda = await lista(auth, 'sudadera', { tipo: 'chamarra' });
    expect(prenda).toMatchObject({ status: 'ready', category: 'top', tipo: 'chamarra' });
    expect(prenda.analisis.evidencias[0]).toContain('lo indicaste tú');
    expect((await subir(auth, await fotoPrenda('falda'), { tipo: 'capa' })).status).toBe(400);
  });

  it('guarda el ajuste, largo, manga, capucha y cuello, y los combina', async () => {
    const auth = await invitado();
    const prenda = await lista(auth);
    const patch = (cuerpo) => request(app).patch(`/api/closet/${prenda.id}`).set(auth).send(cuerpo);
    let res = await patch({ category: 'top', tipo: 'sudadera', ajustes: { ajuste: 'holgado', manga: 'larga', capucha: true } });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tipo: 'sudadera', ajustes: { ajuste: 'holgado', manga: 'larga', capucha: true } });
    res = await patch({ category: 'top', ajustes: { largo: 'corto' } });
    expect(res.body.data.ajustes).toEqual({ ajuste: 'holgado', manga: 'larga', capucha: true, largo: 'corto' });
    // Persistente: aparece igual al listar.
    const armario = await request(app).get('/api/closet').set(auth);
    expect(armario.body.data.items[0].ajustes.largo).toBe('corto');
  });

  it('rechaza respuestas inválidas y tipos de otra categoría (400)', async () => {
    const auth = await invitado();
    const prenda = await lista(auth);
    const patch = (cuerpo) => request(app).patch(`/api/closet/${prenda.id}`).set(auth).send(cuerpo);
    expect((await patch({ category: 'top', ajustes: { ajuste: 'gigante' } })).status).toBe(400);
    expect((await patch({ category: 'top', ajustes: { color: 'rojo' } })).status).toBe(400);
    expect((await patch({ category: 'top', ajustes: { capucha: 'si' } })).status).toBe(400);
    expect((await patch({ category: 'top', tipo: 'jeans' })).body.code).toBe('TIPO_INVALIDO');
    expect((await patch({ category: 'top', tipo: 'nave' })).status).toBe(400);
  });

  it('se puede cambiar la foto de una prenda; en una ajena es 404 y sin imagen 400', async () => {
    const [a, b] = [await invitado(), await invitado()];
    const prenda = await lista(a, 'falda');
    const nueva = await request(app).post(`/api/closet/${prenda.id}/foto`).set(a).set('Content-Type', 'image/jpeg').send(await fotoPrenda('pantalon'));
    expect(nueva.status).toBe(202);
    expect(await esperar(a, prenda.id)).toMatchObject({ status: 'ready', category: 'bottom' });
    const ajena = await request(app).post(`/api/closet/${prenda.id}/foto`).set(b).set('Content-Type', 'image/jpeg').send(await fotoPrenda('falda'));
    expect(ajena.status).toBe(404);
    expect((await request(app).post(`/api/closet/${prenda.id}/foto`).set(a)).status).toBe(400);
  });

  it('las rutas de links ya no existen', async () => {
    const auth = await invitado();
    expect((await request(app).post('/api/closet/importar').set(auth).send({ url: 'https://x.example/a' })).status).toBe(404);
    expect((await request(app).post('/api/ropa/escanear-link').send({ url: 'https://x.example/a' })).status).toBe(404);
  });
});
