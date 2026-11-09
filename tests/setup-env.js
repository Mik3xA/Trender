// Entorno aislado para cada archivo de pruebas: base SQLite en memoria,
// bcrypt rápido y carpeta de uploads temporal (dev.db nunca se toca).
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = ':memory:';
process.env.JWT_SECRET = 'secreto-de-pruebas-no-usar-en-produccion';
process.env.BCRYPT_ROUNDS = '4';
process.env.AUTH_RATE_LIMIT = '1000';
process.env.UPLOADS_DIR = path.join(os.tmpdir(), `trender-test-${process.pid}-${Math.random().toString(36).slice(2)}`);
