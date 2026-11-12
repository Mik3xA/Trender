const fs = require('fs');
const request = require('supertest');
const sharp = require('sharp');

const app = require('../src/app');
const closet = require('../src/servicios/closet.service');
const { PRIVADO_DIR } = require('../src/servicios/privado.service');
const tryon = require('../src/servicios/tryon.service');
const { fotoPrenda, fotoPersona } = require('./siluetas-prueba');

jest.setTimeout(40000);
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GEMINI_API_KEY;
  delete process.env.FASHN_API_KEY;
  delete process.env.TRYON_PROVIDER;
});
afterAll(() => {
  fs.rmSync(closet.UPLOADS_DIR, { recursive: true, force: true });
  fs.rmSync(PRIVADO_DIR, { recursive: true, force: true });
});

async function invitado() {
  const res = await request(app).post('/api/auth/invitado');
  return { Authorization: `Bearer ${res.body.data.token}` };
}

async function esperar(auth, url) {
  for (let i = 0; i < 300; i += 1) {
    const res = await request(app).get(url).set(auth);
    if (res.body.data.status !== 'processing') return res.body.data;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error('no terminó');
}

const subirPersona = async (auth, foto) => request(app).post('/api/persona').set(auth).set('Content-Type', 'image/jpeg').send(foto ?? (await fotoPersona()));

async function prenda(auth, forma, query = {}) {
  const res = await request(app).post('/api/closet/subir').query(query).set(auth).set('Content-Type', 'image/jpeg').send(await fotoPrenda(forma));
  return esperar(auth, `/api/closet/${res.body.data.id}`);
}

describe('/api/persona (fotos de la persona)', () => {
  it('sube, lista, sirve la imagen solo a su dueño y borra', async () => {
    const [a, b] = [await invitado(), await invitado()];
    const res = await subirPersona(a);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ ancho: 600, alto: 900, imagen_url: `/api/persona/${res.body.data.id}/imagen` });

    expect((await request(app).get('/api/persona').set(a)).body.data.count).toBe(1);
    expect((await request(app).get('/api/persona').set(b)).body.data.count).toBe(0);

    const img = await request(app).get(res.body.data.imagen_url).set(a);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect((await sharp(img.body).metadata()).exif).toBeUndefined(); // sin metadatos privados
    expect((await request(app).get(res.body.data.imagen_url)).status).toBe(401); // sin sesión
    expect((await request(app).get(res.body.data.imagen_url).set(b)).status).toBe(404); // de otro

    expect((await request(app).delete(`/api/persona/${res.body.data.id}`).set(b)).status).toBe(404);
    expect((await request(app).delete(`/api/persona/${res.body.data.id}`).set(a)).body.data.deleted).toBe(true);
    expect((await request(app).get(res.body.data.imagen_url).set(a)).status).toBe(404);
  });

  it('valida la foto: sin imagen 400, no imagen 415, duplicada 409', async () => {
    const a = await invitado();
    expect((await request(app).post('/api/persona').set(a)).status).toBe(400);
    expect((await subirPersona(a, Buffer.from('nada'))).status).toBe(415);
    const foto = await fotoPersona();
    expect((await subirPersona(a, foto)).status).toBe(201);
    expect((await subirPersona(a, foto)).body.code).toBe('FOTO_DUPLICADA');
  });

  it('las fotos de la persona no se publican en /media', async () => {
    const a = await invitado();
    await subirPersona(a);
    expect(fs.existsSync(PRIVADO_DIR)).toBe(true);
    expect(PRIVADO_DIR.startsWith(closet.UPLOADS_DIR)).toBe(false);
  });
});

describe('/api/pruebas (prueba con IA)', () => {
  it('sin claves trabaja en modo vista previa local', async () => {
    const a = await invitado();
    expect((await request(app).get('/api/pruebas/estado').set(a)).body.data).toMatchObject({ proveedor: 'local', ia: false, maxPrendas: 4 });
  });

  it('genera una prueba con prenda superior e inferior: 202 -> ready con imagen privada', async () => {
    const a = await invitado();
    const persona = (await subirPersona(a)).body.data;
    const [arriba, abajo] = [await prenda(a, 'camiseta'), await prenda(a, 'pantalon')];
    const res = await request(app).post('/api/pruebas').set(a).send({ personaId: persona.id, prendas: [{ id: arriba.id }, { id: abajo.id }] });
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ status: 'processing', proveedor: 'local' });
    const lista = await esperar(a, `/api/pruebas/${res.body.data.id}`);
    expect(lista).toMatchObject({ status: 'ready', imagen_url: `/api/pruebas/${lista.id}/imagen` });
    expect(lista.prendas.map((p) => p.categoria)).toEqual(['top', 'bottom']);
    expect(lista.avisos[0]).toContain('Vista previa sin IA');
    const img = await request(app).get(lista.imagen_url).set(a);
    expect((await sharp(img.body).metadata())).toMatchObject({ format: 'jpeg', width: 600, height: 900 });
    expect((await request(app).get('/api/pruebas').set(a)).body.data.count).toBe(1);
    expect((await request(app).delete(`/api/pruebas/${lista.id}`).set(a)).body.data.deleted).toBe(true);
  });

  it('no deja dos prendas en la misma parte, prendas o fotos ajenas, ni listas inválidas', async () => {
    const [a, b] = [await invitado(), await invitado()];
    const persona = (await subirPersona(a)).body.data;
    const [t1, t2] = [await prenda(a, 'camiseta'), await prenda(a, 'sudadera')];
    const crear = (auth, cuerpo) => request(app).post('/api/pruebas').set(auth).send(cuerpo);
    expect((await crear(a, { personaId: persona.id, prendas: [{ id: t1.id }, { id: t2.id }] })).body.code).toBe('PARTES_REPETIDAS');
    expect((await crear(b, { personaId: persona.id, prendas: [{ id: t1.id }] })).status).toBe(404);
    expect((await crear(a, { personaId: persona.id, prendas: [] })).status).toBe(400);
    expect((await crear(a, { personaId: persona.id, prendas: [{ id: t1.id }, { id: t1.id }] })).status).toBe(400);
    expect((await crear(a, { personaId: 'x', prendas: [{ id: t1.id }] })).status).toBe(400);
  });

  it('un outfit completo se puede usar entero o solo una parte', async () => {
    const a = await invitado();
    const persona = (await subirPersona(a)).body.data;
    const outfit = await prenda(a, 'outfit-apilado', { tipo: 'outfit' });
    expect(outfit).toMatchObject({ category: 'outfit', tipo: 'outfit', nombre: 'Outfit completo', ajustes: { usar: ['top', 'bottom', 'shoes'] } });
    const tenis = await prenda(a, 'tenis');
    // Todo el outfit + tenis: el calzado choca.
    let res = await request(app).post('/api/pruebas').set(a).send({ personaId: persona.id, prendas: [{ id: outfit.id }, { id: tenis.id }] });
    expect(res.body.code).toBe('PARTES_REPETIDAS');
    // Solo la parte de arriba del outfit + tenis: válido.
    res = await request(app).post('/api/pruebas').set(a).send({ personaId: persona.id, prendas: [{ id: outfit.id, usar: ['top'] }, { id: tenis.id }] });
    expect(res.status).toBe(202);
    expect(res.body.data.prendas[0].usar).toEqual(['top']);
    expect((await esperar(a, `/api/pruebas/${res.body.data.id}`)).status).toBe('ready');
  });

  it('detecta que una foto puede ser un outfit completo y lo pregunta', async () => {
    const a = await invitado();
    const item = await prenda(a, 'outfit-apilado');
    expect(item.analisis.posibleOutfit).toBe(true);
    expect(item.analisis.avisos.join(' ')).toContain('outfit completo');
    const res = await request(app).patch(`/api/closet/${item.id}`).set(a).send({ category: 'outfit', tipo: 'outfit', ajustes: { usar: ['bottom', 'shoes'] } });
    expect(res.body.data).toMatchObject({ category: 'outfit', ajustes: { usar: ['bottom', 'shoes'] } });
    expect((await request(app).patch(`/api/closet/${item.id}`).set(a).send({ category: 'outfit', ajustes: { usar: ['cabeza'] } })).status).toBe(400);
  });
});

describe('tryon.service: proveedores de IA (respuestas simuladas)', () => {
  const png = async (forma) => (await sharp(await fotoPrenda(forma)).png().toBuffer());
  const respuesta = (cuerpo, status = 200) => ({ ok: status < 400, status, json: async () => cuerpo, arrayBuffer: async () => new ArrayBuffer(0) });

  it('elige el proveedor por las claves configuradas', () => {
    expect(tryon.proveedorActivo()).toBe('local');
    process.env.FASHN_API_KEY = 'f';
    expect(tryon.proveedorActivo()).toBe('fashn');
    process.env.GEMINI_API_KEY = 'g';
    expect(tryon.proveedorActivo()).toBe('gemini');
    process.env.TRYON_PROVIDER = 'fashn';
    expect(tryon.proveedorActivo()).toBe('fashn');
  });

  it('Gemini: una petición con la persona y todas las prendas, e instrucciones por prenda', async () => {
    process.env.GEMINI_API_KEY = 'clave-gemini';
    const salida = await sharp({ create: { width: 60, height: 90, channels: 3, background: '#888' } }).png().toBuffer();
    const espia = jest.spyOn(global, 'fetch').mockResolvedValue(
      respuesta({ candidates: [{ content: { parts: [{ text: 'listo' }, { inlineData: { mimeType: 'image/png', data: salida.toString('base64') } }] } }] })
    );
    const persona = await fotoPersona();
    const r = await tryon.generar(persona, [
      { png: await png('chamarra-cierre'), categoria: 'top', tipo: 'chamarra', color: 'negro', ajustes: { ajuste: 'holgado', capucha: true } },
      { png: await png('outfit-apilado'), categoria: 'outfit', tipo: 'outfit', usar: ['bottom'] },
    ]);
    expect(r.proveedor).toBe('gemini');
    expect((await sharp(r.buffer).metadata()).format).toBe('jpeg');
    const [url, opciones] = espia.mock.calls[0];
    expect(url).toContain('/models/gemini-2.5-flash-image:generateContent');
    expect(opciones.headers['x-goog-api-key']).toBe('clave-gemini');
    const partes = JSON.parse(opciones.body).contents[0].parts;
    expect(partes).toHaveLength(4); // instrucción + persona + 2 prendas
    expect(partes[0].text).toContain('Image 2: jacket (negro), loose / oversized fit, with a hood');
    expect(partes[0].text).toContain('Use ONLY the lower-body garment');
  });

  it('Gemini: errores claros si la clave es inválida o no devuelve imagen', async () => {
    process.env.GEMINI_API_KEY = 'mala';
    const persona = await fotoPersona();
    const prendas = [{ png: await png('camiseta'), categoria: 'top', tipo: 'camiseta' }];
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(respuesta({ error: { message: 'API key not valid' } }, 400));
    await expect(tryon.generar(persona, prendas)).rejects.toMatchObject({ code: 'IA_ERROR', message: expect.stringContaining('API key not valid') });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(respuesta({ promptFeedback: { blockReason: 'SAFETY' } }));
    await expect(tryon.generar(persona, prendas)).rejects.toMatchObject({ code: 'IA_SIN_IMAGEN', message: expect.stringContaining('SAFETY') });
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(respuesta({}, 401));
    await expect(tryon.generar(persona, prendas)).rejects.toMatchObject({ code: 'IA_CLAVE_INVALIDA' });
  });

  it('FASHN: una prenda por petición (abajo primero), espera el resultado y omite el calzado', async () => {
    process.env.FASHN_API_KEY = 'clave-fashn';
    const salida = (await sharp({ create: { width: 60, height: 90, channels: 3, background: '#444' } }).jpeg().toBuffer()).toString('base64');
    const llamadas = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (url, opciones = {}) => {
      llamadas.push({ url, cuerpo: opciones.body ? JSON.parse(opciones.body) : null });
      if (url.endsWith('/run')) return respuesta({ id: `job${llamadas.length}` });
      return respuesta({ status: 'completed', output: [`data:image/jpeg;base64,${salida}`] });
    });
    const persona = await fotoPersona();
    const r = await tryon.generarFashn(
      persona,
      [
        { png: await png('camiseta'), categoria: 'top' },
        { png: await png('pantalon'), categoria: 'bottom' },
        { png: await png('tenis'), categoria: 'shoes' },
      ],
      { intervaloMs: 1 }
    );
    const runs = llamadas.filter((l) => l.url.endsWith('/run'));
    expect(runs.map((l) => l.cuerpo.inputs.category)).toEqual(['bottoms', 'tops']);
    expect(runs[0].cuerpo.model_name).toBe('tryon-v1.6');
    expect(runs[0].cuerpo.inputs.model_image).toMatch(/^data:image\/jpeg;base64,/);
    expect(r.avisos[0]).toContain('calzado');
  });
});
