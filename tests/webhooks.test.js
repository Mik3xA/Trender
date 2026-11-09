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

  it('rechaza un payload vacío con 400 desde express-validator', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post('/webhooks/recibir').send({});
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toEqual(
      expect.arrayContaining(['transaction_id', 'amount', 'customer_email'])
    );
  });
});
