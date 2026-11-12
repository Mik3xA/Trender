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
process.env.PRIVATE_DIR = path.join(os.tmpdir(), `trender-privado-${process.pid}-${Math.random().toString(36).slice(2)}`);
// Las pruebas nunca llaman a una IA real: sin claves se usa la vista previa local.
delete process.env.GEMINI_API_KEY;
delete process.env.FASHN_API_KEY;
delete process.env.TRYON_PROVIDER;
process.env.TRYON_RATE_LIMIT = '1000';
process.env.GUEST_RATE_LIMIT = '1000';
process.env.IMPORT_RATE_LIMIT = '1000';
delete process.env.REMOVE_BG_API_KEY;
