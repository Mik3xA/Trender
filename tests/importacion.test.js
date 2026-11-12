const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const pagina = require('../src/servicios/pagina.service');
const scraper = require('../src/servicios/scraper.service');
const closet = require('../src/servicios/closet.service');
const { decidir } = require('../src/servicios/importacion.service');
const { fotoCatalogo, fotoConModelo } = require('./imagenes-prueba');

/** Simula una tienda: HTML de producto y sus fotos, sin salir a internet. */
function simularTienda({ titulo, categoria, fotos }) {
  jest.spyOn(scraper, 'extraerProducto').mockImplementation(async (url) => ({
    url,
    tienda: 'generica',
    titulo,
    categoriaTienda: categoria,
    imagenes: Object.keys(fotos).map((u, i) => ({ url: u, fuente: 'json-ld', prioridad: 8 - i })),
    metodo: 'http',
    bloqueado: false,
  }));
  jest.spyOn(pagina, 'obtenerImagen').mockImplementation(async (u) => {
    if (!fotos[u]) throw new Error('404');
    return { url: u, buffer: await fotos[u](), tipo: 'image/jpeg' };
  });
}

async function invitado() {
  const res = await request(app).post('/api/auth/invitado');
  return { auth: { Authorization: `Bearer ${res.body.data.token}` }, user: res.body.data.user };
}

/** Consulta la prenda hasta que termine el análisis (igual que el frontend). */
async function esperar(auth, id) {
  for (let i = 0; i < 100; i += 1) {
    const res = await request(app).get(`/api/closet/${id}`).set(auth);
    if (res.body.data.status !== 'processing') return res.body.data;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error('la importación no terminó');
}

afterEach(() => jest.restoreAllMocks());
afterAll(() => fs.rmSync(closet.UPLOADS_DIR, { recursive: true, force: true }));

describe('POST /api/auth/invitado', () => {
  it('crea una sesión anónima sin registro', async () => {
    const res = await request(app).post('/api/auth/invitado');
    expect(res.status).toBe(201);
    expect(res.body.data.user.nombre).toBe('Invitado');
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.data.token}`);
    expect(me.status).toBe(200);
  });
});

describe('importación de prendas desde links', () => {
  it('responde 202, analiza en segundo plano y guarda el recorte de la mejor foto', async () => {
    simularTienda({
      titulo: 'Playera básica roja',
      categoria: 'Hombre > Playeras',
      fotos: {
        'https://cdn.tienda.example/modelo.jpg': fotoConModelo,
        'https://cdn.tienda.example/catalogo.jpg': () => fotoCatalogo('camiseta'),
      },
    });
    const { auth, user } = await invitado();
    const res = await request(app)
      .post('/api/closet/importar')
      .set(auth)
      .send({ url: 'https://tienda.example/playera-roja', genero: 'Masculino' });
    expect(res.status).toBe(202);
    expect(res.headers.location).toBe(`/api/closet/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({ status: 'processing', genero: 'Masculino' });

    const prenda = await esperar(auth, res.body.data.id);
    expect(prenda).toMatchObject({
      status: 'ready',
      category: 'top',
      tipo: 'camiseta',
      nombre: 'Playera básica roja',
      imagen_url: `/media/closet/${user.id}/${prenda.id}.png`,
    });
    expect(prenda.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(prenda.analisis.confianza).toBe('alta');
    expect(prenda.analisis.evidencias.join(' ')).toContain('título del producto');
    expect(prenda.analisis.metodoRecorte).toBe('recorte-local');
    // Eligió la foto de catálogo, no la del modelo.
    expect(prenda.analisis.fotosEvaluadas[0].url).toBe('https://cdn.tienda.example/catalogo.jpg');

    const media = await request(app).get(prenda.imagen_url);
    expect(media.status).toBe(200);
    expect(media.headers['content-type']).toBe('image/png');
    expect(media.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('si el texto no basta, la silueta de la foto decide (pantalón)', async () => {
    simularTienda({ titulo: 'Modelo 8891 edición otoño', categoria: null, fotos: { 'https://cdn.x.example/1.jpg': () => fotoCatalogo('pantalon') } });
    const { auth } = await invitado();
    const res = await request(app).post('/api/closet/importar').set(auth).send({ url: 'https://x.example/p/8891', genero: 'Femenino' });
    const prenda = await esperar(auth, res.body.data.id);
    expect(prenda).toMatchObject({ status: 'ready', category: 'bottom', tipo: 'pantalon' });
    expect(prenda.analisis.evidencias.join(' ')).toContain('dos perneras');
  });

  it('distingue tenis de zapatos por el texto y los guarda como calzado', async () => {
    simularTienda({ titulo: 'Zapatos Oxford de piel', categoria: 'Calzado > Formal', fotos: { 'https://cdn.x.example/z.jpg': () => fotoCatalogo('tenis') } });
    const { auth } = await invitado();
    const res = await request(app).post('/api/closet/importar').set(auth).send({ url: 'https://x.example/oxford', genero: 'Masculino' });
    expect(await esperar(auth, res.body.data.id)).toMatchObject({ category: 'shoes', tipo: 'zapatos' });
  });

  it('sin evidencia queda en "review" y el usuario elige la categoría', async () => {
    simularTienda({ titulo: 'Producto 445', categoria: null, fotos: {} });
    const { auth } = await invitado();
    const res = await request(app).post('/api/closet/importar').set(auth).send({ url: 'https://x.example/p/445' });
    const prenda = await esperar(auth, res.body.data.id);
    expect(prenda).toMatchObject({ status: 'review', category: null });
    expect(prenda.analisis.avisos[0]).toContain('No se encontraron fotos');

    const corregida = await request(app).patch(`/api/closet/${prenda.id}`).set(auth).send({ category: 'dress', tipo: 'vestido' });
    expect(corregida.body.data).toMatchObject({ status: 'ready', category: 'dress', tipo: 'vestido' });
  });

  it('los accesorios no se importan', async () => {
    simularTienda({ titulo: 'Cinturón de piel café', categoria: 'Accesorios', fotos: {} });
    const { auth } = await invitado();
    const res = await request(app).post('/api/closet/importar').set(auth).send({ url: 'https://x.example/cinturon' });
    expect(await esperar(auth, res.body.data.id)).toMatchObject({ status: 'failed', error: expect.stringContaining('accesorio') });
  });

  it('cada género tiene su propio armario y el mismo link puede estar en ambos', async () => {
    simularTienda({ titulo: 'Jeans rectos', categoria: 'Jeans', fotos: {} });
    const { auth } = await invitado();
    const url = 'https://x.example/jeans-rectos';
    const a = await request(app).post('/api/closet/importar').set(auth).send({ url, genero: 'Femenino' });
    const b = await request(app).post('/api/closet/importar').set(auth).send({ url, genero: 'Masculino' });
    expect([a.status, b.status]).toEqual([202, 202]);
    expect((await request(app).post('/api/closet/importar').set(auth).send({ url, genero: 'Femenino' })).status).toBe(409);
    await esperar(auth, a.body.data.id);
    await esperar(auth, b.body.data.id);

    const mujer = await request(app).get('/api/closet?genero=Femenino').set(auth);
    const hombre = await request(app).get('/api/closet?genero=Masculino').set(auth);
    expect(mujer.body.data.items.map((i) => i.id)).toEqual([a.body.data.id]);
    expect(hombre.body.data.items.map((i) => i.id)).toEqual([b.body.data.id]);
  });

  it('borrar una prenda elimina también su recorte', async () => {
    simularTienda({ titulo: 'Falda', categoria: 'Faldas', fotos: { 'https://cdn.x.example/f.jpg': () => fotoCatalogo('vestido') } });
    const { auth } = await invitado();
    const res = await request(app).post('/api/closet/importar').set(auth).send({ url: 'https://x.example/falda-1' });
    const prenda = await esperar(auth, res.body.data.id);
    const archivo = path.join(closet.UPLOADS_DIR, prenda.imagen_url.replace('/media/', ''));
    expect(fs.existsSync(archivo)).toBe(true);
    await request(app).delete(`/api/closet/${prenda.id}`).set(auth);
    expect(fs.existsSync(archivo)).toBe(false);
  });
});

describe('decidir (texto + análisis visual)', () => {
  const visual = { categoria: 'Piernas', tipo: 'pantalon', confianza: 'alta', puntos: { Piernas: 4, Torso: 0, Vestido: -2, Calzado: 0 }, evidencias: ['dos perneras separadas abajo'] };
  it('el texto claro manda y la foto lo confirma', () => {
    expect(decidir({ categoria: 'Piernas', tipo: 'jeans', confianza: 'media', fuentes: ['titulo'] }, visual)).toMatchObject({
      categoria: 'Piernas',
      tipo: 'jeans',
      confianza: 'alta',
    });
  });
  it('sin texto, decide la foto', () => {
    expect(decidir({ categoria: null, tipo: null, confianza: 'ninguna', fuentes: [] }, visual)).toMatchObject({ categoria: 'Piernas', tipo: 'pantalon', confianza: 'alta' });
  });
  it('si el texto y la foto se contradicen con seguridad, pregunta', () => {
    expect(decidir({ categoria: 'Torso', tipo: 'camiseta', confianza: 'media', fuentes: ['titulo'] }, visual)).toMatchObject({ categoria: null });
  });
  it('sin texto ni foto concluyente no decide', () => {
    expect(decidir({ categoria: null, tipo: null, confianza: 'ninguna', fuentes: [] }, null)).toMatchObject({ categoria: null });
  });
});
