const fs = require('fs');
const path = require('path');

const { db, generarId } = require('./db.service');
const { errorOperacional } = require('./errores.service');
const closet = require('./closet.service');
const persona = require('./persona.service');
const privado = require('./privado.service');
const tryon = require('./tryon.service');
const { encolar } = require('./importacion.service');

/**
 * Pruebas: una foto de la persona + hasta 4 prendas del armario -> imagen
 * generada (asíncrono: 202 "processing" y luego "ready" o "failed").
 */

const MAX_PRENDAS = 4;

const consultas = {
  insertar: db.prepare('INSERT INTO pruebas (id, user_id, persona_id, prendas_json, proveedor) VALUES (?, ?, ?, ?, ?)'),
  obtener: db.prepare('SELECT * FROM pruebas WHERE id = ? AND user_id = ?'),
  listar: db.prepare('SELECT * FROM pruebas WHERE user_id = ? ORDER BY created_at DESC, id LIMIT 40'),
  actualizar: db.prepare(`UPDATE pruebas SET status = @status, image_path = @image_path, avisos_json = @avisos_json, error = @error,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = @id`),
  eliminar: db.prepare('DELETE FROM pruebas WHERE id = ? AND user_id = ?'),
};

// Pruebas que quedaron a medias si el servidor se reinició.
db.prepare(`UPDATE pruebas SET status = 'failed', error = 'Se interrumpió: vuelve a intentarlo' WHERE status = 'processing'`).run();

function serializar(fila) {
  return {
    id: fila.id,
    persona_id: fila.persona_id,
    prendas: JSON.parse(fila.prendas_json),
    status: fila.status,
    proveedor: fila.proveedor,
    avisos: fila.avisos_json ? JSON.parse(fila.avisos_json) : [],
    error: fila.error,
    imagen_url: fila.status === 'ready' ? `/api/pruebas/${fila.id}/imagen` : null,
    created_at: fila.created_at,
  };
}

/** Parte del cuerpo que ocupa cada prenda (para no repetir dos "partes de arriba"). */
function partesDe(item, usar) {
  if (item.category === 'outfit') return usar ?? item.ajustes?.usar ?? ['top', 'bottom', 'shoes'];
  return item.category === 'dress' ? ['top', 'bottom'] : [item.category];
}

/**
 * @param {string} userId
 * @param {{ personaId: string, prendas: Array<{ id: string, usar?: string[] }> }} datos
 */
function crear(userId, { personaId, prendas }) {
  persona.filaPropia(userId, personaId); // 404 si no es suya
  if (!prendas?.length || prendas.length > MAX_PRENDAS) throw errorOperacional(400, `Elige de 1 a ${MAX_PRENDAS} prendas`);

  const ocupadas = new Map();
  const elegidas = prendas.map(({ id, usar }) => {
    const item = closet.obtenerPrenda(userId, id); // 404 si no es suya
    if (item.status !== 'ready' || !item.imagen_url) {
      throw errorOperacional(409, `"${item.nombre ?? 'La prenda'}" aún no está lista para probarse`, 'PRENDA_NO_LISTA');
    }
    for (const parte of partesDe(item, usar)) {
      if (ocupadas.has(parte)) {
        throw errorOperacional(400, `"${item.nombre}" y "${ocupadas.get(parte)}" ocupan la misma parte del cuerpo: elige solo una`, 'PARTES_REPETIDAS');
      }
      ocupadas.set(parte, item.nombre);
    }
    return {
      id: item.id,
      nombre: item.nombre,
      categoria: item.category,
      tipo: item.tipo,
      imagen_url: item.imagen_url,
      ...(item.category === 'outfit' ? { usar: partesDe(item, usar) } : {}),
    };
  });

  const id = generarId();
  const proveedor = tryon.proveedorActivo();
  consultas.insertar.run(id, userId, personaId, JSON.stringify(elegidas), proveedor);
  const terminado = encolar(() => procesar(userId, id, personaId, elegidas, proveedor));
  return { prueba: obtener(userId, id), terminado };
}

async function procesar(userId, id, personaId, elegidas, proveedor) {
  try {
    const fotoPersona = persona.leerImagen(userId, personaId);
    const prendas = elegidas.map((e) => {
      const item = closet.obtenerPrenda(userId, e.id);
      return {
        png: fs.readFileSync(closet.rutaAbsoluta(item.imagen_url.replace('/media/', ''))),
        categoria: item.category,
        tipo: item.tipo,
        color: item.analisis?.visual?.detalle?.colores?.[0]?.nombre ?? null,
        ajustes: item.ajustes,
        usar: e.usar,
      };
    });
    const resultado = await tryon.generar(fotoPersona, prendas, proveedor);
    const imagePath = path.posix.join('pruebas', userId, `${id}.jpg`);
    privado.guardar(imagePath, resultado.buffer);
    consultas.actualizar.run({ id, status: 'ready', image_path: imagePath, avisos_json: JSON.stringify(resultado.avisos), error: null });
  } catch (err) {
    const mensaje = err.statusCode && err.statusCode < 600 && err.message ? err.message : 'No se pudo generar la prueba';
    if (!err.statusCode) console.error('[Pruebas]', err);
    consultas.actualizar.run({ id, status: 'failed', image_path: null, avisos_json: null, error: mensaje });
  }
}

function obtener(userId, id) {
  const fila = consultas.obtener.get(id, userId);
  if (!fila) throw errorOperacional(404, 'Prueba no encontrada');
  return serializar(fila);
}

function listar(userId) {
  return consultas.listar.all(userId).map(serializar);
}

function leerImagen(userId, id) {
  const fila = consultas.obtener.get(id, userId);
  if (!fila?.image_path) throw errorOperacional(404, 'Imagen no encontrada');
  return privado.leer(fila.image_path);
}

function eliminar(userId, id) {
  const fila = consultas.obtener.get(id, userId);
  if (!fila) throw errorOperacional(404, 'Prueba no encontrada');
  if (fila.status === 'processing') throw errorOperacional(409, 'La prueba aún se está generando', 'EN_PROCESO');
  consultas.eliminar.run(id, userId);
  privado.borrar(fila.image_path);
  return { id, deleted: true };
}

function estado() {
  const proveedor = tryon.proveedorActivo();
  return { proveedor, ia: proveedor !== 'local', maxPrendas: MAX_PRENDAS, maxFotos: persona.MAX_FOTOS };
}

module.exports = { crear, obtener, listar, leerImagen, eliminar, estado, MAX_PRENDAS };
