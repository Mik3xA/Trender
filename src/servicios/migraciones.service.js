/**
 * Migraciones versionadas del esquema SQLite (dev.db).
 *
 * Cada migración se aplica una sola vez, dentro de una transacción, y queda
 * registrada en `schema_migrations`. Para cambiar el esquema se AÑADE una
 * migración nueva al final del arreglo; nunca se edita una ya publicada.
 *
 * Una migración puede ser `sql` (texto) o `up(db)` (función), para los casos
 * que dependen de lo que ya exista en la base.
 *
 * Ejecución manual:  npm run db:migrate
 * (db.service.js también las ejecuta automáticamente al abrir la base).
 */

function tablaExiste(db, nombre) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(nombre));
}

function columnas(db, tabla) {
  return db.pragma(`table_info(${tabla})`).map((c) => c.name);
}

const MIGRACIONES = [
  {
    version: 1,
    nombre: 'webhook_events',
    // IF NOT EXISTS: las bases creadas antes de las migraciones ya la tienen.
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
    up(db) {
      // Cuentas. Las bases del prototipo anterior ya traen `users` con la misma
      // forma (id, nombre, email, password_hash, created_at): se reutiliza.
      if (!tablaExiste(db, 'users')) {
        db.exec(`
          CREATE TABLE users (
            id            TEXT PRIMARY KEY,
            nombre        TEXT NOT NULL,
            email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
          );
        `);
      } else if (!columnas(db, 'users').includes('nombre')) {
        db.exec("ALTER TABLE users ADD COLUMN nombre TEXT NOT NULL DEFAULT ''");
      }

      db.exec(`
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
      `);

      // Las medidas del prototipo (estatura, peso, complexión, género) pasan al
      // perfil: estatura -> altura y el resto a avatar_config_json.
      if (tablaExiste(db, 'user_measurements')) {
        db.exec(`
          INSERT INTO user_profiles (id, user_id, altura, avatar_config_json)
          SELECT lower(hex(randomblob(16))), m.user_id,
                 CASE WHEN m.estatura BETWEEN 50 AND 260 THEN m.estatura END,
                 json_object('peso', m.peso, 'complexion', m.complexion, 'genero', m.genero)
          FROM user_measurements m
          JOIN users u ON u.id = m.user_id;
          DROP TABLE user_measurements;
        `);
      }
      // Todo usuario existente tiene perfil.
      db.exec(`
        INSERT OR IGNORE INTO user_profiles (id, user_id)
        SELECT lower(hex(randomblob(16))), id FROM users;
      `);
      db.exec('DROP TABLE IF EXISTS wardrobe_items');
    },
  },
  {
    version: 3,
    nombre: 'armario_por_genero_importacion_e_invitados',
    up(db) {
      // Usuarios invitados: se usan sin registrarse (sin pantalla de login).
      db.exec('ALTER TABLE users ADD COLUMN es_invitado INTEGER NOT NULL DEFAULT 0');

      // SQLite no permite cambiar un CHECK: se reconstruye la tabla (procedimiento oficial).
      db.exec(`
        CREATE TABLE closet_items_nueva (
          id            TEXT PRIMARY KEY,
          user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          genero        TEXT NOT NULL DEFAULT 'Femenino' CHECK (genero IN ('Femenino', 'Masculino')),
          source_url    TEXT,
          image_path    TEXT,
          category      TEXT CHECK (category IS NULL OR category IN ('top', 'bottom', 'dress', 'shoes')),
          tipo          TEXT,
          nombre        TEXT,
          color         TEXT,
          tienda        TEXT,
          precio        TEXT,
          imagen_origen TEXT,
          analisis_json TEXT CHECK (analisis_json IS NULL OR json_valid(analisis_json)),
          error         TEXT,
          -- review = no se pudo identificar la prenda: el usuario elige la categoría.
          status        TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('pending', 'processing', 'ready', 'review', 'failed')),
          created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        INSERT INTO closet_items_nueva (id, user_id, source_url, image_path, category, status, created_at, updated_at)
          SELECT id, user_id, source_url, image_path, category, status, created_at, updated_at FROM closet_items;
        DROP TABLE closet_items;
        ALTER TABLE closet_items_nueva RENAME TO closet_items;
        CREATE INDEX idx_closet_items_user_genero ON closet_items(user_id, genero, created_at DESC);
        -- Un mismo link no se repite dentro del armario de un género.
        CREATE UNIQUE INDEX idx_closet_items_user_genero_url ON closet_items(user_id, genero, source_url) WHERE source_url IS NOT NULL;
      `);
    },
  },
  {
    version: 4,
    nombre: 'closet_items_ajustes',
    // Respuestas del cuestionario de la prenda (ajuste, largo, manga, capucha, cuello).
    up(db) {
      if (!columnas(db, 'closet_items').includes('ajustes_json')) {
        db.exec('ALTER TABLE closet_items ADD COLUMN ajustes_json TEXT CHECK (ajustes_json IS NULL OR json_valid(ajustes_json))');
      }
    },
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
      if (migracion.up) migracion.up(db);
      else db.exec(migracion.sql);
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
