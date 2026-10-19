const request = require('supertest');
const { randomUUID } = require('crypto');
const app = require('../src/app');

function payloadValido() {
  return {
    transaction_id: `TRX-3D-${randomUUID()}`,
    amount: 100,
    customer_email: 'usuario@trender.com',
    currency: 'USD',
    avatar_data: {
      estatura: 175,
      peso: 70,
      complexion: 'Atlética'
    }
  };
}

describe('POST /webhooks/recibir', () => {
  it('debe procesar un webhook válido del avatar 3D y responder 200', async () => {
    const res = await request(app)
      .post('/webhooks/recibir')
      .send(payloadValido());

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.id).toBeDefined();
    expect(res.body.data.duplicated).toBe(false);
  });

  it('debe aceptar avatar_data y persistirlo en metadata', async () => {
    const payload = payloadValido();

    const res = await request(app)
      .post('/webhooks/recibir')
      .send(payload);

    expect(res.status).toBe(200);
  });

  it('debe responder 400 si falta el peso en avatar_data', async () => {
    const payload = payloadValido();
    delete payload.avatar_data.peso;

    const res = await request(app)
      .post('/webhooks/recibir')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.errors.some(e => e.field === 'avatar_data.peso')).toBe(true);
  });

  it('debe responder 400 si falta la estatura en avatar_data', async () => {
    const payload = payloadValido();
    delete payload.avatar_data.estatura;

    const res = await request(app)
      .post('/webhooks/recibir')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.errors.some(e => e.field === 'avatar_data.estatura')).toBe(true);
  });

  it('debe responder 400 si la complexion no es string', async () => {
    const payload = payloadValido();
    payload.avatar_data.complexion = 42;

    const res = await request(app)
      .post('/webhooks/recibir')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.errors.some(e => e.field === 'avatar_data.complexion')).toBe(true);
  });

  it('debe responder 400 si el payload está vacío', async () => {
    const res = await request(app)
      .post('/webhooks/recibir')
      .send({});

    expect(res.status).toBe(400);
  });

  it('debe responder 400 si amount es 0', async () => {
    const payload = payloadValido();
    payload.amount = 0;

    const res = await request(app)
      .post('/webhooks/recibir')
      .send(payload);

    expect(res.status).toBe(400);
  });
});

describe('Rutas inexistentes', () => {
  it('debe responder 404 con el handler global', async () => {
    const res = await request(app).get('/ruta-inexistente');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
  });
});
