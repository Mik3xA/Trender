/**
 * Migraciones versionadas del esquema SQLite (dev.db).
 *
 * Cada migración se aplica una sola vez, dentro de una transacción, y queda
 * registrada en `schema_migrations`. Para cambiar el esquema se AÑADE una
 * migración nueva al final del arreglo; nunca se edita una ya publicada.
 *
 * Ejecución manual:  npm run db:migrate
 * (db.service.js también las ejecuta automáticamente al abrir la base).
 */

const MIGRACIONES = [
  {
    version: 1,
    nombre: 'webhook_events',
    // Tabla original del middleware de webhooks (IF NOT EXISTS: bases previas ya la tienen).
    sql: `
      CREATE TABLE IF NOT EXISTS webhook_events (
        id TEXT PRIMARY KEY,
        transaction_id TEXT UNIQUE NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        customer_email TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 2,
    nombre: 'usuarios_perfiles_armario_sesiones',
    sql: `
      -- Cuentas. El email se guarda normalizado (minúsculas) y es único.
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      -- Medidas antropométricas (cm) y estado del avatar 3D. Un perfil por usuario.
      CREATE TABLE user_profiles (
        id                 TEXT PRIMARY KEY,
        user_id            TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        altura             REAL CHECK (altura  IS NULL OR altura  BETWEEN 50 AND 260),
        pecho              REAL CHECK (pecho   IS NULL OR pecho   BETWEEN 30 AND 200),
        cintura            REAL CHECK (cintura IS NULL OR cintura BETWEEN 30 AND 200),
        cadera             REAL CHECK (cadera  IS NULL OR cadera  BETWEEN 30 AND 200),
        avatar_config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(avatar_config_json)),
        updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      -- Prendas del armario. image_path queda reservado hasta que el recorte termine.
      CREATE TABLE closet_items (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_url TEXT,
        image_path TEXT,
        category   TEXT NOT NULL CHECK (category IN ('top', 'bottom', 'shoes')),
        status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_closet_items_user ON closet_items(user_id, created_at DESC);
      -- Un mismo link no se duplica dentro del armario de un usuario.
      CREATE UNIQUE INDEX idx_closet_items_user_url ON closet_items(user_id, source_url) WHERE source_url IS NOT NULL;

      -- Sesiones del servidor: el JWT lleva el id de sesión (claim "sid").
      -- Revocar la fila invalida el token aunque su firma siga siendo válida.
      CREATE TABLE sessions (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        expires_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
    `,
  },
];

/**
 * Aplica las migraciones pendientes sobre una conexión better-sqlite3.
 * @param {import('better-sqlite3').Database} db
 * @returns {number[]} versiones aplicadas en esta ejecución
 */
function migrar(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      nombre     TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const aplicadas = new Set(db.prepare('SELECT version FROM schema_migrations').pluck().all());
  const registrar = db.prepare('INSERT INTO schema_migrations (version, nombre) VALUES (?, ?)');
  const nuevas = [];

  for (const migracion of MIGRACIONES) {
    if (aplicadas.has(migracion.version)) continue;
    db.transaction(() => {
      db.exec(migracion.sql);
      registrar.run(migracion.version, migracion.nombre);
    })();
    nuevas.push(migracion.version);
  }
  return nuevas;
}

module.exports = { migrar, MIGRACIONES };

// `node src/servicios/migraciones.service.js` aplica las migraciones y termina.
if (require.main === module) {
  require('dotenv').config();
  const { db } = require('./db.service');
  const version = db.prepare('SELECT MAX(version) FROM schema_migrations').pluck().get();
  console.log(`[DB] Esquema en la versión ${version}`);
}
