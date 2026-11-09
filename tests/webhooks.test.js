const request = require('supertest');
const app = require('../src/app');

describe('POST /webhooks/recibir', () => {
  beforeAll(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterAll(() => jest.restoreAllMocks());

  it('acepta un payload válido con 200 y status success', async () => {
    const res = await request(app).post('/webhooks/recibir').send({
      transaction_id: 'tx-001',
      amount: 49.9,
      customer_email: 'cliente@trender.test',
      currency: 'EUR',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  it('acepta avatar_data válido y marca los duplicados', async () => {
    const payload = {
      transaction_id: 'tx-avatar-1',
      amount: 100,
      customer_email: 'cliente@trender.test',
      avatar_data: { estatura: 172, peso: 70, complexion: 'Media', genero: 'Masculino' },
    };
    const primero = await request(app).post('/webhooks/recibir').send(payload);
    expect(primero.status).toBe(200);
    expect(primero.body.data.duplicated).toBe(false);
    const segundo = await request(app).post('/webhooks/recibir').send(payload);
    expect(segundo.body.data).toMatchObject({ db_id: primero.body.data.db_id, duplicated: true });
  });

  it('rechaza avatar_data incompleto con 400', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post('/webhooks/recibir').send({
      transaction_id: 'tx-avatar-2',
      amount: 100,
      customer_email: 'cliente@trender.test',
      avatar_data: { estatura: -1, complexion: '' },
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field).sort()).toEqual([
      'avatar_data.complexion',
      'avatar_data.estatura',
      'avatar_data.peso',
    ]);
  });

  it('responde 404 JSON en rutas inexistentes', async () => {
    const res = await request(app).get('/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
  });

  it('rechaza un payload vacío con 400 desde express-validator', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post('/webhooks/recibir').send({});
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toEqual(
      expect.arrayContaining(['transaction_id', 'amount', 'customer_email'])
    );
  });
});
