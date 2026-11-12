/**
 * Se ejecuta antes de `npm run dev` y `npm start` (predev / prestart).
 * Si tras un `git pull` hay dependencias nuevas sin instalar, explica qué hacer
 * en lugar de dejar que el servidor caiga con un MODULE_NOT_FOUND.
 */
const path = require('path');

const raiz = path.join(__dirname, '..');
const { dependencies = {} } = require(path.join(raiz, 'package.json'));

function faltantes() {
  return Object.keys(dependencies).filter((nombre) => {
    try {
      require.resolve(nombre, { paths: [raiz] });
      return false;
    } catch {
      return true;
    }
  });
}

if (require.main === module) {
  const faltan = faltantes();
  if (faltan.length) {
    console.error(`\n[Trender] Faltan dependencias: ${faltan.join(', ')}`);
    console.error('[Trender] Ejecuta "npm install" en la carpeta raíz del proyecto y vuelve a intentarlo.\n');
    process.exit(1);
  }
}

module.exports = { faltantes };
