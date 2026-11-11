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
// Las pruebas nunca salen a internet: el escáner solo analiza la URL salvo que el test lo pida.
process.env.SCAN_FETCH_PAGES = 'false';
process.env.SCRAPER_BROWSER = 'false';
process.env.GUEST_RATE_LIMIT = '1000';
process.env.IMPORT_RATE_LIMIT = '1000';
delete process.env.REMOVE_BG_API_KEY;
