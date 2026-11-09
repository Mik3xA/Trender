const { db, guardarDatos, obtenerEventoPorId } = require('../src/servicios/db.service');
const { enviarAlerta } = require('../src/servicios/email.service');
const { MIGRACIONES } = require('../src/servicios/migraciones.service');
const cache = require('../src/servicios/cache.service');
const { normalizarUrlProducto } = require('../src/servicios/url.service');
const authService = require('../src/servicios/auth.service');
const perfilService = require('../src/servicios/perfil.service');
const closetService = require('../src/servicios/closet.service');

beforeAll(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
afterAll(() => jest.restoreAllMocks());

describe('db.service', () => {
  it('aplica todas las migraciones y crea las tablas', () => {
    const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all();
    expect(tablas).toEqual(expect.arrayContaining(['users', 'user_profiles', 'closet_items', 'sessions', 'webhook_events']));
    const version = db.prepare('SELECT MAX(version) FROM schema_migrations').pluck().get();
    expect(version).toBe(MIGRACIONES.at(-1).version);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('guarda eventos de webhook y detecta duplicados', async () => {
    const datos = { transaction_id: 'tx-svc', amount: 10, customer_email: 'a@b.co' };
    const primero = await guardarDatos(datos);
    const segundo = await guardarDatos(datos);
    expect(segundo).toMatchObject({ id: primero.id, duplicated: true });
    expect((await obtenerEventoPorId('tx-svc')).amount).toBe(10);
  });
});

describe('email.service', () => {
  it('envía en modo test sin SMTP configurado', async () => {
    const resultado = await enviarAlerta('hola', 'asunto');
    expect(resultado).toMatchObject({ success: true, testMode: true });
  });
});

describe('cache.service', () => {
  it('aísla las claves por usuario y limpia todo en limpiarUsuario', () => {
    cache.guardar('u1', 'closet:all', [1]);
    cache.guardar('u2', 'closet:all', [2]);
    expect(cache.obtener('u1', 'closet:all')).toEqual([1]);
    cache.limpiarUsuario('u1');
    expect(cache.obtener('u1', 'closet:all')).toBeUndefined();
    expect(cache.obtener('u2', 'closet:all')).toEqual([2]);
  });

  it('expira entradas según su TTL', () => {
    cache.guardar('u3', 'k', 'v', -1);
    expect(cache.obtener('u3', 'k')).toBeUndefined();
  });
});

describe('url.service', () => {
  it('normaliza URLs públicas y quita el fragmento', () => {
    expect(normalizarUrlProducto(' https://Shop.example.com/p/1?c=red#reviews ')).toBe('https://shop.example.com/p/1?c=red');
  });

  it.each([
    'ftp://shop.example.com/a',
    'javascript:alert(1)',
    'http://localhost:3000/x',
    'http://127.0.0.1/x',
    'http://10.1.2.3/x',
    'http://192.168.0.10/x',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/x',
    'http://intranet/x',
    'http://printer.local/x',
    'https://user:pass@shop.example.com/x',
    'no es una url',
  ])('rechaza %s', (url) => {
    expect(() => normalizarUrlProducto(url)).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('auth.service / perfil.service / closet.service', () => {
  let ana;
  let beto;

  beforeAll(async () => {
    ana = await authService.registrar({ email: 'Ana@Trender.test', password: 'clave-segura-123' });
    beto = await authService.registrar({ email: 'beto@trender.test', password: 'clave-segura-123' });
  });

  it('guarda el hash bcrypt, nunca la contraseña, y normaliza el email', () => {
    const fila = db.prepare('SELECT email, password_hash FROM users WHERE id = ?').get(ana.user.id);
    expect(fila.email).toBe('ana@trender.test');
    expect(fila.password_hash).toMatch(/^\$2[aby]\$/);
    expect(fila.password_hash).not.toContain('clave-segura-123');
  });

  it('rechaza emails duplicados con 409', async () => {
    await expect(authService.registrar({ email: 'ANA@trender.test', password: 'otra-clave-123' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('verifica el token y lo invalida al cerrar sesión', () => {
    const auth = authService.verificarToken(ana.token);
    expect(auth.userId).toBe(ana.user.id);
    expect(authService.cerrarSesion(auth)).toEqual({ revoked: true });
    expect(() => authService.verificarToken(ana.token)).toThrow(expect.objectContaining({ statusCode: 401 }));
  });

  it('actualiza solo los campos de perfil enviados', () => {
    perfilService.actualizarPerfil(beto.user.id, { altura: 180, avatar_config: { pose: 'A' } });
    const perfil = perfilService.actualizarPerfil(beto.user.id, { cintura: 82 });
    expect(perfil).toMatchObject({ altura: 180, cintura: 82, pecho: null, avatar_config: { pose: 'A' } });
  });

  it('nunca expone prendas de otro usuario', () => {
    const prenda = closetService.agregarDesdeLink(beto.user.id, { url: 'https://shop.example.com/a', category: 'top' });
    expect(prenda).toMatchObject({ status: 'pending', category: 'top' });
    expect(prenda.image_path).toBe(`closet/${beto.user.id}/${prenda.id}.png`);

    expect(closetService.listarPrendas(ana.user.id)).toEqual([]);
    expect(() => closetService.obtenerPrenda(ana.user.id, prenda.id)).toThrow(expect.objectContaining({ statusCode: 404 }));
    expect(() => closetService.eliminarPrenda(ana.user.id, prenda.id)).toThrow(expect.objectContaining({ statusCode: 404 }));
    expect(closetService.listarPrendas(beto.user.id)).toHaveLength(1);
  });

  it('borra en cascada perfil, sesiones y prendas al eliminar el usuario', () => {
    db.prepare('DELETE FROM users WHERE id = ?').run(beto.user.id);
    for (const tabla of ['user_profiles', 'sessions', 'closet_items']) {
      expect(db.prepare(`SELECT COUNT(*) FROM ${tabla} WHERE user_id = ?`).pluck().get(beto.user.id)).toBe(0);
    }
  });
});
