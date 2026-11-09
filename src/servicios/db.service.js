const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const { migrar } = require('./migraciones.service');

// DATABASE_URL admite "file:./ruta.db" (estilo Prisma) o ":memory:" para pruebas.
const dbPath = process.env.DATABASE_URL?.replace('file:', '') || path.join(__dirname, '../../dev.db');
const db = new Database(dbPath);

// Integridad referencial (ON DELETE CASCADE) y escrituras concurrentes más seguras.
db.pragma('foreign_keys = ON');
if (dbPath !== ':memory:') db.pragma('journal_mode = WAL');

const aplicadas = migrar(db);
if (aplicadas.length) console.log(`[DB] Migraciones aplicadas: ${aplicadas.join(', ')}`);

function generarId() {
  return crypto.randomUUID();
}

async function guardarDatos(datos) {
  const {
    transaction_id,
    amount,
    currency = 'USD',
    customer_email,
    metadata = {}
  } = datos;

  const stmt = db.prepare(`
    INSERT INTO webhook_events (id, transaction_id, amount, currency, customer_email, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const id = generarId();
  // Los datos del avatar que envía el frontend al generar el modelo se guardan junto a metadata.
  const metaJson = JSON.stringify(datos.avatar_data ? { ...metadata, avatar_data: datos.avatar_data } : metadata);

  try {
    stmt.run(id, transaction_id, amount, currency, customer_email, metaJson);
    console.log(`[DB] Webhook guardado: ${transaction_id}`);
    return { id, transaction_id };
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const existing = db.prepare('SELECT id FROM webhook_events WHERE transaction_id = ?').get(transaction_id);
      console.log(`[DB] Webhook duplicado ignorado: ${transaction_id}`);
      return { id: existing.id, transaction_id, duplicated: true };
    }
    throw err;
  }
}

async function obtenerEventos(limite = 100) {
  return db.prepare('SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT ?').all(limite);
}

async function obtenerEventoPorId(transactionId) {
  return db.prepare('SELECT * FROM webhook_events WHERE transaction_id = ?').get(transactionId);
}

module.exports = {
  db,
  generarId,
  guardarDatos,
  obtenerEventos,
  obtenerEventoPorId
};
