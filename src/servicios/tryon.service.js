const sharp = require('sharp');

const { errorOperacional } = require('./errores.service');

/**
 * Prueba virtual: viste a la persona de su foto con las prendas elegidas.
 *
 * Proveedores (se elige con TRYON_PROVIDER o, si no se indica, por la clave que haya):
 * - gemini: Google Gemini (edición de imagen). Una sola petición con la foto de la
 *   persona y TODAS las prendas; entiende instrucciones ("de este outfit usa solo
 *   los pantalones"). Requiere GEMINI_API_KEY.
 * - fashn: FASHN (modelo especializado en try-on). Una petición por prenda, encadenadas.
 *   Requiere FASHN_API_KEY. No viste calzado.
 * - local: sin IA. Vista previa aproximada que superpone los recortes sobre la
 *   foto (sirve para probar el flujo sin claves; no es una foto realista).
 */

const TIEMPO_MAXIMO_MS = 120_000;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const FASHN_URL = 'https://api.fashn.ai/v1';

/** Nombre en inglés de cada tipo (las instrucciones a la IA funcionan mejor en inglés). */
const PRENDA_EN = {
  camiseta: 'T-shirt', camisa: 'button-up shirt', blusa: 'blouse', top: 'sleeveless top', sueter: 'sweater',
  sudadera: 'sweatshirt / hoodie', chamarra: 'jacket', blazer: 'blazer', abrigo: 'coat',
  pantalon: 'trousers', jeans: 'jeans', jogger: 'jogger sweatpants', leggings: 'leggings', short: 'shorts', falda: 'skirt',
  vestido: 'dress', tenis: 'sneakers', zapatos: 'shoes', botas: 'boots', sandalias: 'sandals', outfit: 'outfit',
};
const PARTE_EN = { top: 'the upper-body garment (top)', bottom: 'the lower-body garment (pants/skirt)', dress: 'the dress', shoes: 'the shoes' };
const AJUSTE_EN = { ajustado: 'tight / slim fit', regular: 'regular fit', holgado: 'loose / oversized fit' };
const LARGO_EN = { corto: 'cropped / short length', normal: null, largo: 'long length' };
const MANGA_EN = { sin: 'sleeveless', corta: 'short sleeves', 'tres-cuartos': 'three-quarter sleeves', larga: 'long sleeves' };

function proveedorActivo() {
  const elegido = (process.env.TRYON_PROVIDER || '').trim().toLowerCase();
  if (elegido === 'local') return 'local';
  if ((elegido === 'gemini' || !elegido) && process.env.GEMINI_API_KEY) return 'gemini';
  if ((elegido === 'fashn' || !elegido) && process.env.FASHN_API_KEY) return 'fashn';
  return 'local';
}

/** Descripción de una prenda para la instrucción ("loose fit hoodie, long sleeves, with hood"). */
function describirPrenda(prenda) {
  const a = prenda.ajustes ?? {};
  if (prenda.categoria === 'outfit') {
    const partes = (prenda.usar?.length ? prenda.usar : ['top', 'bottom', 'shoes']).map((p) => PARTE_EN[p]);
    return `a photo of a complete outfit. Use ONLY ${partes.join(', ')} from it; ignore everything else in that image (including any person or background)`;
  }
  const rasgos = [AJUSTE_EN[a.ajuste], LARGO_EN[a.largo], MANGA_EN[a.manga], a.capucha ? 'with a hood' : null, a.cuello ? 'with a collar' : null]
    .filter(Boolean)
    .join(', ');
  return `${PRENDA_EN[prenda.tipo] ?? 'garment'}${prenda.color ? ` (${prenda.color})` : ''}${rasgos ? `, ${rasgos}` : ''}`;
}

function instruccion(prendas) {
  const lista = prendas.map((p, i) => `- Image ${i + 2}: ${describirPrenda(p)}.`).join('\n');
  return [
    'You are a professional virtual try-on system.',
    'Image 1 is a photo of a person. Edit image 1 so that the SAME person is wearing the clothing shown in the following images:',
    lista,
    'Rules:',
    '- Keep the person exactly the same: face, identity, hair, skin tone, body shape, pose and expression.',
    '- Keep the background, framing, camera angle and lighting of image 1.',
    '- Replace only the clothing items that the new garments cover; keep any other clothes the person is already wearing.',
    '- Reproduce each garment faithfully (color, print, logos, texture, buttons, zippers) and make it fit the body naturally,',
    '  with realistic folds, shadows and occlusion (arms or hair in front of the garment).',
    '- Output one photorealistic image with the same aspect ratio as image 1. Do not add text or watermarks.',
  ].join('\n');
}

/** Prenda recortada (PNG con transparencia) sobre fondo blanco, como foto de catálogo. */
async function prendaComoFoto(png) {
  return sharp(png).flatten({ background: '#ffffff' }).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
}

async function peticion(url, opciones, nombre) {
  let respuesta;
  try {
    respuesta = await fetch(url, { ...opciones, signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS) });
  } catch (err) {
    throw errorOperacional(502, `No se pudo conectar con ${nombre}: ${err.name === 'TimeoutError' ? 'tardó demasiado' : 'sin conexión'}`, 'IA_SIN_CONEXION');
  }
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const detalle = cuerpo?.error?.message ?? cuerpo?.message ?? cuerpo?.error ?? `HTTP ${respuesta.status}`;
    // La clave es válida pero el proyecto no tiene facturación (la generación de imágenes no entra en el nivel gratuito).
    if (/billing|free tier|quota.*(limit: 0|exceeded)/i.test(String(detalle))) {
      throw errorOperacional(
        502,
        `${nombre} requiere activar la facturación en tu cuenta: la generación de imágenes no está en el nivel gratuito. Actívala en https://aistudio.google.com/billing y vuelve a intentarlo.`,
        'IA_FACTURACION'
      );
    }
    const codigo = respuesta.status === 401 || respuesta.status === 403 ? 'IA_CLAVE_INVALIDA' : respuesta.status === 429 ? 'IA_LIMITE' : 'IA_ERROR';
    throw errorOperacional(502, `${nombre} respondió un error: ${String(detalle).slice(0, 200)}`, codigo);
  }
  return cuerpo;
}

// ------------------------------------------------------------------ Gemini

async function generarGemini(persona, prendas) {
  const modelo = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const partes = [{ text: instruccion(prendas) }, { inline_data: { mime_type: 'image/jpeg', data: persona.toString('base64') } }];
  for (const prenda of prendas) {
    partes.push({ inline_data: { mime_type: 'image/jpeg', data: (await prendaComoFoto(prenda.png)).toString('base64') } });
  }
  const cuerpo = await peticion(
    `${GEMINI_URL}/${encodeURIComponent(modelo)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: partes }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }),
    },
    'Gemini'
  );
  const respuestas = cuerpo?.candidates?.[0]?.content?.parts ?? [];
  const imagen = respuestas.map((p) => p.inlineData ?? p.inline_data).find((d) => d?.data);
  if (!imagen) {
    const texto = respuestas.map((p) => p.text).filter(Boolean).join(' ').slice(0, 200);
    const bloqueo = cuerpo?.promptFeedback?.blockReason ?? cuerpo?.candidates?.[0]?.finishReason;
    throw errorOperacional(502, `La IA no devolvió una imagen${bloqueo ? ` (${bloqueo})` : ''}${texto ? `: ${texto}` : ''}`, 'IA_SIN_IMAGEN');
  }
  return { buffer: Buffer.from(imagen.data, 'base64'), avisos: [] };
}

// ------------------------------------------------------------------ FASHN

const CATEGORIA_FASHN = { top: 'tops', bottom: 'bottoms', dress: 'one-pieces', outfit: 'auto' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function generarFashn(persona, prendas, { intervaloMs = 2000 } = {}) {
  const cabeceras = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.FASHN_API_KEY}` };
  const avisos = [];
  let actual = persona;
  // Primero lo de abajo y después lo de arriba: la parte superior queda por encima del pantalón.
  const orden = { bottom: 0, dress: 1, outfit: 1, top: 2 };
  const vestibles = prendas.filter((p) => CATEGORIA_FASHN[p.categoria]).sort((a, b) => orden[a.categoria] - orden[b.categoria]);
  if (vestibles.length < prendas.length) avisos.push('Este proveedor no viste calzado: se omitieron los zapatos.');
  if (!vestibles.length) throw errorOperacional(422, 'Este proveedor no puede vestir las prendas elegidas (solo calzado)', 'IA_SIN_PRENDAS');

  for (const prenda of vestibles) {
    const { id } = await peticion(
      `${FASHN_URL}/run`,
      {
        method: 'POST',
        headers: cabeceras,
        body: JSON.stringify({
          model_name: process.env.FASHN_MODEL || 'tryon-v1.6',
          inputs: {
            model_image: `data:image/jpeg;base64,${actual.toString('base64')}`,
            garment_image: `data:image/jpeg;base64,${(await prendaComoFoto(prenda.png)).toString('base64')}`,
            category: CATEGORIA_FASHN[prenda.categoria],
          },
        }),
      },
      'FASHN'
    );
    if (!id) throw errorOperacional(502, 'FASHN no devolvió un id de trabajo', 'IA_ERROR');
    let estado;
    const limite = Date.now() + TIEMPO_MAXIMO_MS;
    do {
      await espera(intervaloMs);
      estado = await peticion(`${FASHN_URL}/status/${encodeURIComponent(id)}`, { headers: cabeceras }, 'FASHN');
    } while (!['completed', 'failed', 'canceled'].includes(estado.status) && Date.now() < limite);
    if (estado.status !== 'completed' || !estado.output?.[0]) {
      throw errorOperacional(502, `FASHN no terminó la prueba${estado.error ? `: ${estado.error.message ?? estado.error}` : ''}`, 'IA_ERROR');
    }
    const salida = String(estado.output[0]);
    if (salida.startsWith('data:')) actual = Buffer.from(salida.split(',')[1], 'base64');
    else {
      const imagen = await fetch(salida, { signal: AbortSignal.timeout(30_000) });
      if (!imagen.ok) throw errorOperacional(502, 'No se pudo descargar la imagen generada', 'IA_ERROR');
      actual = Buffer.from(await imagen.arrayBuffer());
    }
  }
  return { buffer: actual, avisos };
}

// ------------------------------------------------------------------ local (sin IA)

/** Zonas aproximadas del cuerpo en una foto de cuerpo entero (fracciones del alto/ancho). */
const ZONAS = {
  top: { y0: 0.17, y1: 0.52, ancho: 0.5 },
  dress: { y0: 0.17, y1: 0.8, ancho: 0.52 },
  bottom: { y0: 0.45, y1: 0.9, ancho: 0.42 },
  shoes: { y0: 0.88, y1: 0.99, ancho: 0.34 },
  outfit: { y0: 0.15, y1: 0.98, ancho: 0.56 },
};

async function generarLocal(persona, prendas) {
  const meta = await sharp(persona).metadata();
  const [W, H] = [meta.width, meta.height];
  const orden = { shoes: 0, bottom: 1, dress: 2, outfit: 2, top: 3 };
  const capas = [];
  for (const prenda of [...prendas].sort((a, b) => orden[a.categoria] - orden[b.categoria])) {
    const z = ZONAS[prenda.categoria];
    const caja = { ancho: Math.round(W * z.ancho), alto: Math.round(H * (z.y1 - z.y0)) };
    const capa = await sharp(prenda.png).ensureAlpha().resize(caja.ancho, caja.alto, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    // Sombra suave debajo de la prenda para que no parezca una calcomanía.
    const sombra = await sharp(capa).ensureAlpha().extractChannel(3).blur(6).linear(0.35, 0).toBuffer();
    const sombraRgba = await sharp({ create: { width: caja.ancho, height: caja.alto, channels: 3, background: '#000000' } }).joinChannel(sombra).png().toBuffer();
    const left = Math.round((W - caja.ancho) / 2);
    const top = Math.round(H * z.y0);
    capas.push({ input: sombraRgba, left: left + 4, top: top + 6 }, { input: capa, left, top });
  }
  const buffer = await sharp(persona).composite(capas).jpeg({ quality: 90 }).toBuffer();
  return {
    buffer,
    avisos: ['Vista previa sin IA: las prendas se superponen de forma aproximada. Configura GEMINI_API_KEY o FASHN_API_KEY para fotos realistas.'],
  };
}

const GENERADORES = { gemini: generarGemini, fashn: generarFashn, local: generarLocal };

/**
 * @param {Buffer} persona foto de la persona (JPEG)
 * @param {Array<{ png: Buffer, categoria: string, tipo: string|null, color: string|null, ajustes: object|null, usar?: string[] }>} prendas
 * @returns {Promise<{ buffer: Buffer, proveedor: string, avisos: string[] }>} imagen JPEG
 */
async function generar(persona, prendas, proveedor = proveedorActivo()) {
  const { buffer, avisos } = await GENERADORES[proveedor](persona, prendas);
  // Normaliza la salida (PNG/WEBP de la IA -> JPEG sin metadatos).
  const jpeg = await sharp(buffer, { failOn: 'none' }).rotate().jpeg({ quality: 92 }).toBuffer();
  return { buffer: jpeg, proveedor, avisos };
}

module.exports = { generar, proveedorActivo, instruccion, describirPrenda, generarFashn, generarGemini, generarLocal };
