const sharp = require('sharp');

const { errorOperacional } = require('./errores.service');

/**
 * Procesamiento de imágenes de producto (Sharp / libvips):
 * evaluar qué foto es la mejor, quitar el fondo, analizar la silueta y el color.
 */

const LADO_ANALISIS = 128; // miniatura para medir rápido
const LADO_MASCARA = 384; // resolución de la máscara de recorte
const LADO_SALIDA = 1024; // textura final
const REMOVE_BG_URL = 'https://api.remove.bg/v1.0/removebg';

/** Caja (x, y, ancho, alto) de los píxeles con alfa > umbral; null si no hay ninguno. */
function cajaAlfa(alfa, ancho, alto, umbral = 24) {
  let x0 = ancho;
  let y0 = alto;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < ancho; x += 1) {
      if (alfa[y * ancho + x] > umbral) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, ancho: x1 - x0 + 1, alto: y1 - y0 + 1 };
}

/** Recorta un PNG con alfa al contorno de la prenda, con un margen del 2 %. */
async function recortarAlContorno(png) {
  const { data, info } = await sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const caja = cajaAlfa(data, info.width, info.height);
  if (!caja) throw errorOperacional(422, 'No se encontró la prenda en la foto', 'SIN_PRENDA');
  const margen = Math.round(Math.max(caja.ancho, caja.alto) * 0.02);
  const left = Math.max(0, caja.x - margen);
  const top = Math.max(0, caja.y - margen);
  return sharp(png)
    .extract({
      left,
      top,
      width: Math.min(info.width - left, caja.ancho + margen * 2),
      height: Math.min(info.height - top, caja.alto + margen * 2),
    })
    .png()
    .toBuffer();
}

/** Píxeles RGB crudos de una miniatura (sin alfa, fondo blanco si la imagen era transparente). */
async function miniatura(buffer, lado = LADO_ANALISIS) {
  const { data, info } = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize(lado, lado, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, ancho: info.width, alto: info.height };
}

function distancia(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** Color mediano del borde de la imagen y cuán uniforme es (0 = ruidoso, 1 = liso). */
function fondoDelBorde({ data, ancho, alto }) {
  const r = [];
  const g = [];
  const b = [];
  const tomar = (x, y) => {
    const i = (y * ancho + x) * 3;
    r.push(data[i]);
    g.push(data[i + 1]);
    b.push(data[i + 2]);
  };
  for (let x = 0; x < ancho; x += 1) {
    tomar(x, 0);
    tomar(x, alto - 1);
  }
  for (let y = 1; y < alto - 1; y += 1) {
    tomar(0, y);
    tomar(ancho - 1, y);
  }
  const mediana = (v) => [...v].sort((a, c) => a - c)[Math.floor(v.length / 2)];
  const fondo = [mediana(r), mediana(g), mediana(b)];
  const cerca = r.filter((_, i) => distancia(r[i], g[i], b[i], ...fondo) < 30).length;
  return { fondo, uniformidad: cerca / r.length };
}

/** ¿Tono de piel? (regla clásica RGB/YCbCr para detectar fotos con modelo). */
function esPiel(r, g, b) {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return r > 60 && g > 30 && b > 15 && r > g && r > b && cr >= 135 && cr <= 175 && cb >= 85 && cb <= 135 && Math.abs(r - g) > 12;
}

/**
 * Puntúa una foto de producto. Se prefieren las fotos de la prenda sola
 * (fondo liso, sin piel visible), centradas, de buen tamaño y no apaisadas
 * como un banner.
 */
async function evaluarImagen(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { failOn: 'none' }).metadata();
  } catch {
    throw errorOperacional(415, 'La imagen no se pudo leer');
  }
  const mini = await miniatura(buffer);
  const { fondo, uniformidad } = fondoDelBorde(mini);
  let objeto = 0;
  let piel = 0;
  const total = mini.ancho * mini.alto;
  for (let i = 0; i < mini.data.length; i += 3) {
    const [r, g, b] = [mini.data[i], mini.data[i + 1], mini.data[i + 2]];
    if (distancia(r, g, b, ...fondo) > 40) {
      objeto += 1;
      if (esPiel(r, g, b)) piel += 1;
    }
  }
  const fraccionObjeto = objeto / total;
  const fraccionPiel = objeto ? piel / objeto : 0;
  const proporcion = (meta.width ?? 1) / (meta.height ?? 1);
  const resolucion = Math.min(1, Math.min(meta.width ?? 0, meta.height ?? 0) / 600);

  let puntaje = uniformidad * 3 + resolucion;
  puntaje -= fraccionPiel * 4; // foto con modelo: peor para extraer la prenda
  if (fraccionObjeto < 0.08 || fraccionObjeto > 0.92) puntaje -= 2; // casi vacía o recortada al borde
  if (proporcion > 2 || proporcion < 0.35) puntaje -= 3; // banner o tira
  return {
    ancho: meta.width ?? 0,
    alto: meta.height ?? 0,
    uniformidadFondo: Number(uniformidad.toFixed(3)),
    fraccionObjeto: Number(fraccionObjeto.toFixed(3)),
    fraccionPiel: Number(fraccionPiel.toFixed(3)),
    puntaje: Number(puntaje.toFixed(3)),
  };
}

// ------------------------------------------------------------------ recorte

/** Máscara de primer plano (1 = prenda) por relleno desde el borde. */
function mascaraPorBorde(mini) {
  const { data, ancho, alto } = mini;
  const { fondo, uniformidad } = fondoDelBorde(mini);
  if (uniformidad < 0.6) {
    throw errorOperacional(422, 'La foto no tiene un fondo liso: no se puede recortar la prenda', 'FONDO_NO_LISO');
  }
  const umbral = 34;
  const esFondo = new Uint8Array(ancho * alto);
  const cola = [];
  const intentar = (x, y) => {
    const k = y * ancho + x;
    if (esFondo[k]) return;
    const i = k * 3;
    if (distancia(data[i], data[i + 1], data[i + 2], ...fondo) < umbral) {
      esFondo[k] = 1;
      cola.push(k);
    }
  };
  for (let x = 0; x < ancho; x += 1) {
    intentar(x, 0);
    intentar(x, alto - 1);
  }
  for (let y = 0; y < alto; y += 1) {
    intentar(0, y);
    intentar(ancho - 1, y);
  }
  while (cola.length) {
    const k = cola.pop();
    const x = k % ancho;
    const y = (k - x) / ancho;
    if (x > 0) intentar(x - 1, y);
    if (x < ancho - 1) intentar(x + 1, y);
    if (y > 0) intentar(x, y - 1);
    if (y < alto - 1) intentar(x, y + 1);
  }
  const mascara = new Uint8Array(ancho * alto);
  for (let k = 0; k < mascara.length; k += 1) mascara[k] = esFondo[k] ? 0 : 255;
  return mascara;
}

// ------------------------------------------------------------------ recorte tolerante (fotos caseras)

/** k-medias sobre los colores del borde: los "colores de fondo" (pared, piso, sábana...). */
function modelosDeFondo({ data, ancho, alto }, grosor = 3) {
  const muestras = [];
  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < ancho; x += 1) {
      if (x >= grosor && x < ancho - grosor && y >= grosor && y < alto - grosor) continue;
      const i = (y * ancho + x) * 3;
      muestras.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  const k = 4;
  const ordenadas = [...muestras].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let centros = Array.from({ length: k }, (_, j) => [...ordenadas[Math.floor(((j + 0.5) / k) * ordenadas.length)]]);
  let asignacion = new Uint8Array(muestras.length);
  for (let iter = 0; iter < 10; iter += 1) {
    muestras.forEach((m, n) => {
      let mejor = 0;
      let dMejor = Infinity;
      centros.forEach((c, j) => {
        const d = distancia(...m, ...c);
        if (d < dMejor) {
          dMejor = d;
          mejor = j;
        }
      });
      asignacion[n] = mejor;
    });
    centros = centros.map((c, j) => {
      const miembros = muestras.filter((_, n) => asignacion[n] === j);
      if (!miembros.length) return c;
      return [0, 1, 2].map((canal) => miembros.reduce((s, m) => s + m[canal], 0) / miembros.length);
    });
  }
  return centros
    .map((c, j) => {
      const miembros = muestras.filter((_, n) => asignacion[n] === j);
      const dispersion = miembros.length ? Math.sqrt(miembros.reduce((s, m) => s + distancia(...m, ...c) ** 2, 0) / miembros.length) : 0;
      return { color: c, peso: miembros.length / muestras.length, umbral: Math.min(60, Math.max(24, dispersion * 2.6)) };
    })
    .filter((m) => m.peso >= 0.04);
}

/** Erosión (min) o dilatación (max) cuadrada separable sobre una máscara 0/255. */
function morfologia(mascara, ancho, alto, radio, dilatar) {
  const op = dilatar ? Math.max : Math.min;
  const tmp = new Uint8Array(mascara.length);
  const out = new Uint8Array(mascara.length);
  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < ancho; x += 1) {
      let v = mascara[y * ancho + x];
      for (let d = -radio; d <= radio; d += 1) {
        const xx = Math.min(ancho - 1, Math.max(0, x + d));
        v = op(v, mascara[y * ancho + xx]);
      }
      tmp[y * ancho + x] = v;
    }
  }
  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < ancho; x += 1) {
      let v = tmp[y * ancho + x];
      for (let d = -radio; d <= radio; d += 1) {
        const yy = Math.min(alto - 1, Math.max(0, y + d));
        v = op(v, tmp[yy * ancho + x]);
      }
      out[y * ancho + x] = v;
    }
  }
  return out;
}

/** Deja solo las piezas grandes (la prenda, o el par de zapatos) y quita motas. */
function piezasPrincipales(mascara, ancho, alto) {
  const etiqueta = new Int32Array(mascara.length).fill(-1);
  const areas = [];
  const pila = [];
  for (let inicio = 0; inicio < mascara.length; inicio += 1) {
    if (!mascara[inicio] || etiqueta[inicio] >= 0) continue;
    const id = areas.length;
    let area = 0;
    etiqueta[inicio] = id;
    pila.push(inicio);
    while (pila.length) {
      const k = pila.pop();
      area += 1;
      const x = k % ancho;
      const y = (k - x) / ancho;
      for (const v of [x > 0 ? k - 1 : -1, x < ancho - 1 ? k + 1 : -1, y > 0 ? k - ancho : -1, y < alto - 1 ? k + ancho : -1]) {
        if (v >= 0 && mascara[v] && etiqueta[v] < 0) {
          etiqueta[v] = id;
          pila.push(v);
        }
      }
    }
    areas.push(area);
  }
  const mayor = Math.max(0, ...areas);
  const salida = new Uint8Array(mascara.length);
  for (let k = 0; k < mascara.length; k += 1) if (etiqueta[k] >= 0 && areas[etiqueta[k]] >= mayor * 0.25) salida[k] = 255;
  return salida;
}

/**
 * Máscara para fotos caseras: el fondo puede tener varios colores, degradados
 * y sombras suaves. Se aprende el fondo del borde, se rellena desde el borde
 * todo lo que se le parece (o que continúa suavemente un fondo ya visto), se
 * limpian hilos finos (gancho de la percha, pelusas) y se queda la prenda.
 */
function mascaraPorModelo(mini) {
  const { data, ancho, alto } = mini;
  const modelos = modelosDeFondo(mini);
  const cercania = (k) => {
    const i = k * 3;
    let mejor = Infinity;
    for (const m of modelos) mejor = Math.min(mejor, distancia(data[i], data[i + 1], data[i + 2], ...m.color) / m.umbral);
    return mejor; // < 1: parece fondo
  };
  const esFondo = new Uint8Array(ancho * alto);
  const cola = [];
  const sembrar = (k) => {
    if (!esFondo[k] && cercania(k) < 1.6) {
      esFondo[k] = 1;
      cola.push(k);
    }
  };
  for (let x = 0; x < ancho; x += 1) {
    sembrar(x);
    sembrar((alto - 1) * ancho + x);
  }
  for (let y = 0; y < alto; y += 1) {
    sembrar(y * ancho);
    sembrar(y * ancho + ancho - 1);
  }
  while (cola.length) {
    const k = cola.pop();
    const x = k % ancho;
    const y = (k - x) / ancho;
    for (const v of [x > 0 ? k - 1 : -1, x < ancho - 1 ? k + 1 : -1, y > 0 ? k - ancho : -1, y < alto - 1 ? k + ancho : -1]) {
      if (v < 0 || esFondo[v]) continue;
      const c = cercania(v);
      // Parecido a un color de fondo, o continuación suave (degradado, sombra) no muy lejana.
      const suave = distancia(data[v * 3], data[v * 3 + 1], data[v * 3 + 2], data[k * 3], data[k * 3 + 1], data[k * 3 + 2]) < 7;
      if (c < 1 || (suave && c < 2.2)) {
        esFondo[v] = 1;
        cola.push(v);
      }
    }
  }
  // Huecos encerrados (entre las piernas, entre manga y cuerpo, franjas del piso
  // cortadas por la prenda): zonas grandes parecidas al fondo que no tocan el borde.
  // Si aparecen MUCHAS es un estampado (rayas claras como la pared): entonces solo
  // se quitan las de color casi idéntico al fondo.
  // Dos pasadas: lo que se quita en la primera puede dejar "tocando fondo" a otra zona.
  for (let pasada = 0; pasada < 2; pasada += 1) {
    const regiones = [];
    const visto = new Uint8Array(ancho * alto);
    const minimo = Math.max(12, ancho * alto * 0.0004);
    for (let inicio = 0; inicio < esFondo.length; inicio += 1) {
      if (esFondo[inicio] || visto[inicio] || cercania(inicio) >= 1.8) continue;
      const region = [inicio];
      let suma = 0;
      let tocaFondo = false;
      visto[inicio] = 1;
      for (let n = 0; n < region.length; n += 1) {
        const k = region[n];
        suma += cercania(k);
        const x = k % ancho;
        const y = (k - x) / ancho;
        for (const v of [x > 0 ? k - 1 : -1, x < ancho - 1 ? k + 1 : -1, y > 0 ? k - ancho : -1, y < alto - 1 ? k + ancho : -1]) {
          if (v >= 0 && esFondo[v]) tocaFondo = true;
          if (v >= 0 && !esFondo[v] && !visto[v] && cercania(v) < 1.8) {
            visto[v] = 1;
            region.push(v);
          }
        }
      }
      if (region.length >= minimo) regiones.push({ pixeles: region, media: suma / region.length, tocaFondo });
    }
    const esEstampado = regiones.filter((r) => r.pixeles.length >= ancho * alto * 0.002).length >= 5;
    // Alto de la prenda (lo que no es fondo): un hueco real (entre las piernas, entre la
    // manga y el cuerpo) es alargado; un logo o letras claras son manchas pequeñas.
    let yMin = alto;
    let yMax = 0;
    for (let k = 0; k < esFondo.length; k += 1) {
      if (esFondo[k]) continue;
      const y = Math.floor(k / ancho);
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
    const altoPrenda = Math.max(1, yMax - yMin);
    for (const r of regiones) {
      let r0 = alto;
      let r1 = 0;
      for (const k of r.pixeles) {
        const y = Math.floor(k / ancho);
        if (y < r0) r0 = y;
        if (y > r1) r1 = y;
      }
      const altoRegion = r1 - r0 + 1;
      // Alto respecto a la prenda y alargado (alto ≥ 2.5 × ancho medio): un estampado es más "redondo".
    const alargado = altoRegion >= altoPrenda * 0.1 && altoRegion >= (r.pixeles.length / altoRegion) * 2.5;
      // Un cierre o una costura clara es alto pero muy fino: no es un hueco.
      const anchoMedio = r.pixeles.length / altoRegion;
      const ancho_ = anchoMedio >= Math.max(3, ancho * 0.008);
      // Continuación del fondo ya quitado (la "V" de la entrepierna, sombras junto al borde).
      const continuaFondo = r.tocaFondo && r.media < 1.2 && !esEstampado;
      if (continuaFondo || (alargado && ancho_ && !esEstampado && r.media < 1.45) || r.media < 0.25) for (const k of r.pixeles) esFondo[k] = 1;
    }
  }

  let mascara = new Uint8Array(ancho * alto);
  for (let k = 0; k < mascara.length; k += 1) mascara[k] = esFondo[k] ? 0 : 255;
  const radio = Math.max(1, Math.round(Math.min(ancho, alto) * 0.008));
  mascara = morfologia(morfologia(mascara, ancho, alto, radio, false), ancho, alto, radio, true);
  mascara = piezasPrincipales(mascara, ancho, alto);
  let primerPlano = 0;
  for (const v of mascara) if (v) primerPlano += 1;
  const fraccion = primerPlano / mascara.length;
  if (fraccion < 0.03 || fraccion > 0.93) {
    throw errorOperacional(422, 'No se pudo separar la prenda del fondo: tómale la foto sobre una superficie lisa y con buena luz', 'FONDO_NO_LISO');
  }
  return mascara;
}

/** Quita fondo con remove.bg (si hay REMOVE_BG_API_KEY). Devuelve PNG con alfa o null. */
async function quitarFondoRemoteBg(buffer) {
  const clave = process.env.REMOVE_BG_API_KEY;
  if (!clave) return null;
  const formulario = new FormData();
  formulario.append('image_file', new Blob([buffer]), 'prenda');
  formulario.append('size', 'auto');
  formulario.append('type', 'product');
  const respuesta = await fetch(REMOVE_BG_URL, {
    method: 'POST',
    headers: { 'X-Api-Key': clave },
    body: formulario,
    signal: AbortSignal.timeout(20000),
  });
  if (!respuesta.ok) return null; // sin créditos, clave inválida, etc.: se usa el recorte local
  return Buffer.from(await respuesta.arrayBuffer());
}

/**
 * Recorta la prenda: PNG RGBA de hasta 1024 px, ajustado al contorno, con
 * borde suavizado. Usa remove.bg si está configurado; si no, un recorte local
 * pensado para fotos de catálogo (fondo blanco o liso).
 * Con `tolerante` acepta fotos caseras (fondo con varios colores o degradado).
 * @returns {Promise<{ png: Buffer, metodo: string, ancho: number, alto: number }>}
 */
async function quitarFondo(buffer, { tolerante = false } = {}) {
  let recorteRemoto = null;
  try {
    recorteRemoto = await quitarFondoRemoteBg(buffer);
  } catch {
    recorteRemoto = null;
  }
  if (recorteRemoto) {
    const ajustado = await recortarAlContorno(await sharp(recorteRemoto).ensureAlpha().png().toBuffer());
    const png = await sharp(ajustado).resize(LADO_SALIDA, LADO_SALIDA, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    const meta = await sharp(png).metadata();
    return { png, metodo: 'remove.bg', ancho: meta.width, alto: meta.height };
  }

  const base = sharp(buffer, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).resize(LADO_SALIDA, LADO_SALIDA, { fit: 'inside', withoutEnlargement: true });
  const { data: rgb, info } = await base.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mini = await miniatura(buffer, LADO_MASCARA);
  let mascara;
  let metodo = 'recorte-local';
  // Una foto casera con dos fondos (pared y piso) puede pasar el umbral de "liso":
  // en modo tolerante solo se usa el relleno simple si el borde es casi todo de un color.
  if (tolerante && fondoDelBorde(mini).uniformidad < 0.85) {
    mascara = mascaraPorModelo(mini);
    metodo = 'recorte-tolerante';
  } else {
    mascara = mascaraPorBorde(mini);
  }

  // Máscara a tamaño completo, suavizada para que el borde no se vea pixelado.
  const alfa = await sharp(Buffer.from(mascara), { raw: { width: mini.ancho, height: mini.alto, channels: 1 } })
    .median(3)
    .resize(info.width, info.height, { kernel: 'cubic' })
    .blur(0.8)
    .extractChannel(0) // Sharp devuelve 3 canales tras el desenfoque: se queda en uno.
    .raw()
    .toBuffer();
  // Quita el "halo": los píxeles del borde mezclados con el fondo blanco se vuelven
  // transparentes y el resto del borde se endurece (sin línea clara alrededor de la prenda).
  for (let i = 0; i < alfa.length; i += 1) {
    alfa[i] = Math.max(0, Math.min(255, Math.round((alfa[i] - 170) * (255 / 70))));
  }

  // Descontaminación del borde: los píxeles semitransparentes conservan el blanco del
  // fondo original y dibujan una línea clara; se les da el color medio de la prenda.
  const rgba = Buffer.alloc(info.width * info.height * 4);
  const suma = [0, 0, 0];
  let opacos = 0;
  for (let k = 0; k < alfa.length; k += 1) {
    if (alfa[k] === 255) {
      suma[0] += rgb[k * 3];
      suma[1] += rgb[k * 3 + 1];
      suma[2] += rgb[k * 3 + 2];
      opacos += 1;
    }
  }
  const medio = suma.map((v) => Math.round(v / Math.max(1, opacos)));
  for (let k = 0; k < alfa.length; k += 1) {
    const borde = alfa[k] < 255;
    rgba[k * 4] = borde ? medio[0] : rgb[k * 3];
    rgba[k * 4 + 1] = borde ? medio[1] : rgb[k * 3 + 1];
    rgba[k * 4 + 2] = borde ? medio[2] : rgb[k * 3 + 2];
    rgba[k * 4 + 3] = alfa[k];
  }
  const png = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  const recortado = await recortarAlContorno(png);
  const meta = await sharp(recortado).metadata();
  return { png: recortado, metodo, ancho: meta.width, alto: meta.height };
}

// ------------------------------------------------------------------ silueta y color

/**
 * Rasgos de la silueta recortada (a partir del canal alfa):
 * - proporcion: ancho / alto del contorno.
 * - huecoInferior: fracción de filas del 35 % inferior con hueco en el centro
 *   y tela a ambos lados (dos piernas o un par de zapatos).
 * - anchoArriba: ancho máximo del tercio superior (hombros + mangas) / ancho máximo.
 * - anchoAbajo: ancho al 90 % de la altura / ancho máximo.
 */
async function analizarSilueta(png) {
  const { data: completo, info } = await sharp(png).ensureAlpha().extractChannel(3).resize(96, 96, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  // Se mide sobre el contorno de la prenda, aunque la imagen tenga márgenes.
  const caja = cajaAlfa(completo, info.width, info.height, 128) ?? { x: 0, y: 0, ancho: info.width, alto: info.height };
  const { ancho, alto } = caja;
  const lleno = (x, y) => completo[(y + caja.y) * info.width + (x + caja.x)] > 128;
  const anchoFila = (y) => {
    let min = -1;
    let max = -1;
    for (let x = 0; x < ancho; x += 1) {
      if (lleno(x, y)) {
        if (min < 0) min = x;
        max = x;
      }
    }
    return min < 0 ? 0 : max - min + 1;
  };
  let maxAncho = 1;
  for (let y = 0; y < alto; y += 1) maxAncho = Math.max(maxAncho, anchoFila(y));

  let filasHueco = 0;
  const desde = Math.floor(alto * 0.65);
  for (let y = desde; y < alto; y += 1) {
    const centro = Math.floor(ancho / 2);
    let izquierda = false;
    let derecha = false;
    for (let x = 0; x < centro - 2; x += 1) if (lleno(x, y)) izquierda = true;
    for (let x = centro + 3; x < ancho; x += 1) if (lleno(x, y)) derecha = true;
    const centroVacio = !lleno(centro, y) && !lleno(centro - 1, y) && !lleno(centro + 1, y);
    if (izquierda && derecha && centroVacio) filasHueco += 1;
  }
  const fila = (f) => anchoFila(Math.min(alto - 1, Math.floor(alto * f))) / maxAncho;
  let maxArriba = 0;
  for (let y = 0; y < Math.ceil(alto / 3); y += 1) maxArriba = Math.max(maxArriba, anchoFila(y));
  return {
    proporcion: Number((ancho / alto).toFixed(3)),
    huecoInferior: Number((filasHueco / Math.max(1, alto - desde)).toFixed(3)),
    anchoArriba: Number((maxArriba / maxAncho).toFixed(3)),
    anchoAbajo: Number(fila(0.9).toFixed(3)),
  };
}

/**
 * Opinión de la silueta sobre el tipo de prenda (votos 0..3). La foto de
 * catálogo de un pantalón tiene dos piernas separadas; la de unos tenis es
 * apaisada; una camiseta es más ancha arriba (mangas) que abajo; un vestido
 * es alto y se abre hacia abajo.
 */
function votarSilueta(s) {
  const votos = { Torso: 0, Piernas: 0, Calzado: 0, Vestido: 0 };
  const motivos = [];
  if (s.proporcion > 1.25) {
    votos.Calzado += 3;
    motivos.push('silueta apaisada (calzado)');
  }
  if (s.huecoInferior > 0.45 && s.proporcion < 0.95) {
    votos.Piernas += 3;
    motivos.push('dos piernas separadas abajo');
  } else if (s.huecoInferior > 0.45 && s.proporcion >= 0.95) {
    votos.Calzado += 2;
    motivos.push('par separado (calzado)');
  }
  const sinHueco = s.huecoInferior < 0.2;
  const seAbreAbajo = s.anchoAbajo > s.anchoArriba * 1.4;
  if (s.anchoArriba > 0.9 && s.anchoAbajo < 0.8 && sinHueco && s.proporcion >= 0.7 && s.proporcion <= 1.3) {
    votos.Torso += 2;
    motivos.push('hombros y mangas anchos arriba');
  }
  if (s.proporcion < 0.75 && seAbreAbajo && s.anchoAbajo > 0.8 && sinHueco) {
    votos.Vestido += 2;
    motivos.push('silueta larga que se abre hacia abajo');
  } else if (s.proporcion >= 0.75 && s.proporcion <= 1.3 && seAbreAbajo && sinHueco) {
    votos.Piernas += 2;
    motivos.push('se abre hacia abajo sin piernas (falda)');
  }
  return { votos, motivos };
}

/** Color dominante de la prenda (píxeles opacos, cuantizados) como #rrggbb. */
async function colorDominante(png) {
  const { data } = await sharp(png).ensureAlpha().resize(64, 64, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  const cubetas = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const clave = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const c = cubetas.get(clave) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n += 1;
    c.r += data[i];
    c.g += data[i + 1];
    c.b += data[i + 2];
    cubetas.set(clave, c);
  }
  const mayor = [...cubetas.values()].sort((a, b) => b.n - a.n)[0];
  if (!mayor) return null;
  const hex = (v) => Math.round(v / mayor.n).toString(16).padStart(2, '0');
  return `#${hex(mayor.r)}${hex(mayor.g)}${hex(mayor.b)}`;
}

/** Foto completa normalizada (orientación EXIF, sin metadatos, 1024 px) cuando no se puede recortar. */
async function fotoCompleta(buffer) {
  return sharp(buffer, { failOn: 'none' }).rotate().resize(LADO_SALIDA, LADO_SALIDA, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
}

module.exports = { fotoCompleta, evaluarImagen, quitarFondo, analizarSilueta, votarSilueta, colorDominante, esPiel };
