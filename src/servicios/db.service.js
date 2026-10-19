const Database = require('better-sqlite3');
const path = require('path');
const { randomUUID } = require('crypto');

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
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_measurements (
      user_id TEXT PRIMARY KEY,
      estatura REAL,
      peso REAL,
      complexion TEXT,
      genero TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  migrarUsuarios();
  limpiarTablaVestidor();
}

function migrarUsuarios() {
  const columnaNombre = db
    .pragma('table_info(users)')
    .find((columna) => columna.name === 'nombre');

  if (!columnaNombre || columnaNombre.notnull === 1) {
    return;
  }

  db.exec(`
    CREATE TABLE users_migracion (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    INSERT INTO users_migracion (id, nombre, email, password_hash, created_at)
      SELECT id, COALESCE(NULLIF(TRIM(nombre), ''), email), email, password_hash, created_at
      FROM users;

    DROP TABLE users;
    ALTER TABLE users_migracion RENAME TO users;
  `);
}

function limpiarTablaVestidor() {
  const tablaExiste = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='wardrobe_items'").get();
  if (tablaExiste) {
    db.exec('DROP TABLE wardrobe_items');
    console.log('[DB] Tabla wardrobe_items eliminada');
  }
}

initDb();

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

  const id = randomUUID();
  const metaJson = JSON.stringify(
    datos.avatar_data ? { ...metadata, avatar_data: datos.avatar_data } : metadata
  );

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

function crearUsuario({ id = randomUUID(), nombre, email, passwordHash }) {
  const stmt = db.prepare(`
    INSERT INTO users (id, nombre, email, password_hash)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run(id, nombre, email, passwordHash);
  return obtenerUsuarioPorId(id);
}

function obtenerUsuarioPorEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function obtenerUsuarioPorId(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function eliminarUsuarioPorEmail(email) {
  return db.prepare('DELETE FROM users WHERE email = ?').run(email);
}

function guardarMedidas({ userId, estatura, peso, complexion, genero }) {
  const stmt = db.prepare(`
    INSERT INTO user_measurements (user_id, estatura, peso, complexion, genero, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      estatura = excluded.estatura,
      peso = excluded.peso,
      complexion = excluded.complexion,
      genero = excluded.genero,
      updated_at = datetime('now')
  `);
  stmt.run(userId, estatura, peso, complexion, genero);
  return obtenerMedidas(userId);
}

function obtenerMedidas(userId) {
  return db.prepare('SELECT * FROM user_measurements WHERE user_id = ?').get(userId);
}

function cerrarDb() {
  db.close();
}

module.exports = {
  guardarDatos,
  obtenerEventos,
  obtenerEventoPorId,
  crearUsuario,
  obtenerUsuarioPorEmail,
  obtenerUsuarioPorId,
  eliminarUsuarioPorEmail,
  guardarMedidas,
  obtenerMedidas,
  cerrarDb
};