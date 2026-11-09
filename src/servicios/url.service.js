const net = require('net');
const { errorOperacional } = require('./errores.service');

const LONGITUD_MAXIMA = 2048;
const SUFIJOS_INTERNOS = ['.local', '.localhost', '.internal', '.lan', '.home.arpa'];

/** IPv4/IPv6 literales que apuntan a redes privadas, loopback o link-local. */
function esIpPrivada(host) {
  const ip = host.replace(/^\[|\]$/g, '');
  const version = net.isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (version === 6) {
    const v = ip.toLowerCase();
    return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:');
  }
  return false;
}

/**
 * Valida y normaliza el link de una prenda antes de guardarlo.
 *
 * Se rechazan esquemas distintos de http(s), credenciales embebidas y hosts
 * internos. Así, cuando el servicio de recorte descargue la imagen, no podrá
 * usarse para alcanzar la red interna (SSRF). La resolución DNS se volverá a
 * comprobar en el momento de la descarga.
 *
 * @param {string} entrada
 * @returns {string} URL normalizada (sin fragmento #)
 */
function normalizarUrlProducto(entrada) {
  if (typeof entrada !== 'string' || !entrada.trim()) {
    throw errorOperacional(400, 'La URL es obligatoria');
  }
  if (entrada.length > LONGITUD_MAXIMA) {
    throw errorOperacional(400, `La URL supera ${LONGITUD_MAXIMA} caracteres`);
  }

  let url;
  try {
    url = new URL(entrada.trim());
  } catch {
    throw errorOperacional(400, 'La URL no es válida');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw errorOperacional(400, 'Solo se admiten URLs http o https');
  }
  if (url.username || url.password) {
    throw errorOperacional(400, 'La URL no puede contener credenciales');
  }

  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost' || SUFIJOS_INTERNOS.some((s) => host.endsWith(s)) || esIpPrivada(host)) {
    throw errorOperacional(400, 'La URL apunta a una red interna');
  }
  if (!net.isIP(host.replace(/^\[|\]$/g, '')) && !host.includes('.')) {
    throw errorOperacional(400, 'La URL debe usar un dominio público');
  }

  url.hash = '';
  return url.href;
}

module.exports = { normalizarUrlProducto, esIpPrivada };
