const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const closet = require('../src/servicios/closet.service');
const { decidir } = require('../src/servicios/importacion.service');
const { fotoPrenda } = require('./siluetas-prueba');

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

describe('borrar prendas', () => {
  it('borrar una prenda elimina también su recorte', async () => {
    const { auth } = await invitado();
    const res = await request(app).post('/api/closet/subir').set(auth).set('Content-Type', 'image/jpeg').send(await fotoPrenda('falda'));
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
