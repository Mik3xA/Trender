const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DATABASE_URL?.replace('file:', '') || path.join(__dirname, '../../dev.db');
const db = new Database(dbPath);

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      transaction_id TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      customer_email TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

initDb();

function generarId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
  const metaJson = JSON.stringify(metadata);

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
  guardarDatos,
  obtenerEventos,
  obtenerEventoPorId
};