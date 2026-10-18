const { randomUUID } = require('crypto');
const { guardarDatos, obtenerEventos, obtenerEventoPorId } = require('../src/servicios/db.service');
const { enviarAlerta, enviarAlertaError } = require('../src/servicios/email.service');

describe('db.service', () => {
  it('guardarDatos persiste un webhook y retorna su id', async () => {
    const transactionId = `TRX-DB-${randomUUID()}`;

    const resultado = await guardarDatos({
      transaction_id: transactionId,
      amount: 100,
      currency: 'USD',
      customer_email: 'usuario@trender.com',
      avatar_data: { estatura: 175, peso: 70, complexion: 'Atlética' }
    });

    expect(resultado.id).toBeDefined();
    expect(resultado.transaction_id).toBe(transactionId);
    expect(resultado.duplicado).toBeFalsy();
  });

  it('obtenerEventoPorId encuentra el webhook recién guardado', async () => {
    const transactionId = `TRX-DB-${randomUUID()}`;
    await guardarDatos({
      transaction_id: transactionId,
      amount: 50,
      customer_email: 'usuario@trender.com'
    });

    const evento = await obtenerEventoPorId(transactionId);

    expect(evento).toBeDefined();
    expect(evento.transaction_id).toBe(transactionId);
    expect(JSON.parse(evento.metadata)).toEqual({});
  });

  it('guardarDatos marca como duplicado un transaction_id repetido', async () => {
    const transactionId = `TRX-DB-${randomUUID()}`;
    const datos = {
      transaction_id: transactionId,
      amount: 10,
      customer_email: 'usuario@trender.com'
    };

    await guardarDatos(datos);
    const segundo = await guardarDatos(datos);

    expect(segundo.duplicated).toBe(true);
  });

  it('obtenerEventos retorna una lista con el último webhook', async () => {
    const eventos = await obtenerEventos(5);

    expect(Array.isArray(eventos)).toBe(true);
    expect(eventos.length).toBeGreaterThan(0);
  });
});

describe('email.service', () => {
  it('enviarAlerta funciona en modo simulado sin fallar', async () => {
    const resultado = await enviarAlerta('Mensaje de prueba');

    expect(resultado.success).toBe(true);
  });

  it('enviarAlertaError funciona en modo simulado sin fallar', async () => {
    const resultado = await enviarAlertaError(
      { transaction_id: 'TRX-TEST' },
      new Error('Error de prueba')
    );

    expect(resultado.success).toBe(true);
  });
});
