const sharp = require('sharp');

const { COLORES } = require('./ropa.service');

/**
 * Análisis visual de una prenda ya recortada (PNG con transparencia), sin texto:
 *
 * - Silueta: proporción, hueco entre piernas, escote, mangas (cortas, largas o
 *   sin manga), si se abre hacia abajo, cuántas piezas hay (un par de zapatos)...
 * - Clasificación por puntos en Torso / Piernas / Vestido / Calzado y el tipo
 *   concreto (camiseta, sudadera, jeans, short, falda, tenis, botas...).
 * - Colores principal y secundario con nombre, estampado (liso, rayas,
 *   estampado) y tela probable.
 * - Zonas de la foto (torso y mangas) para proyectarla bien en el avatar 3D.
 */

const LADO = 160;
const UMBRAL_ALFA = 128;

// ------------------------------------------------------------------ máscara

/** Máscara binaria (1 = prenda) a LADO px como máximo. */
async function leerMascara(png) {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .extractChannel(3)
    .resize(LADO, LADO, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const m = new Uint8Array(info.width * info.height);
  for (let i = 0; i < m.length; i += 1) m[i] = data[i] > UMBRAL_ALFA ? 1 : 0;
  return { m, ancho: info.width, alto: info.height };
}

/** Componentes conexas (4 vecinos). Devuelve etiquetas y tamaño/caja de cada una. */
function componentes({ m, ancho, alto }) {
  const etiqueta = new Int32Array(m.length).fill(-1);
  const lista = [];
  const pila = [];
  for (let inicio = 0; inicio < m.length; inicio += 1) {
    if (!m[inicio] || etiqueta[inicio] >= 0) continue;
    const id = lista.length;
    const c = { id, area: 0, x0: ancho, y0: alto, x1: -1, y1: -1 };
    etiqueta[inicio] = id;
    pila.push(inicio);
    while (pila.length) {
      const k = pila.pop();
      const x = k % ancho;
      const y = (k - x) / ancho;
      c.area += 1;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      const vecinos = [x > 0 ? k - 1 : -1, x < ancho - 1 ? k + 1 : -1, y > 0 ? k - ancho : -1, y < alto - 1 ? k + ancho : -1];
      for (const v of vecinos) {
        if (v >= 0 && m[v] && etiqueta[v] < 0) {
          etiqueta[v] = id;
          pila.push(v);
        }
      }
    }
    lista.push(c);
  }
  return { etiqueta, lista };
}

// ------------------------------------------------------------------ rasgos

/** Tramos ocupados [inicio, fin] de una fila (ignora motas de 1 px). */
function tramos(fila) {
  const r = [];
  let inicio = -1;
  for (let x = 0; x <= fila.length; x += 1) {
    const lleno = x < fila.length && fila[x];
    if (lleno && inicio < 0) inicio = x;
    if (!lleno && inicio >= 0) {
      if (x - inicio >= 2) r.push([inicio, x - 1]);
      inicio = -1;
    }
  }
  return r;
}

const mediana = (v) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0);
const redondear = (v, d = 3) => Number(v.toFixed(d));

/**
 * Rasgos numéricos de la silueta, medidos sobre la caja de la prenda.
 * @returns {object} rasgos + caja y anchoTorso en píxeles de la máscara
 */
function medirRasgos(mascara) {
  const { m, ancho } = mascara;
  const { etiqueta, lista } = componentes(mascara);
  if (!lista.length) return null;
  const mayor = Math.max(...lista.map((c) => c.area));
  const validas = lista.filter((c) => c.area >= mayor * 0.08);
  const piezas = validas.filter((c) => c.area >= mayor * 0.25).length;
  const ids = new Set(validas.map((c) => c.id));
  // Piezas una encima de otra (playera arriba, pantalón abajo, tenis al final): foto de un outfit.
  const grandes = validas.filter((c) => c.area >= mayor * 0.15).sort((a, b) => a.y0 - b.y0);
  let apiladas = 0;
  for (let i = 1; i < grandes.length; i += 1) {
    const solape = grandes[i - 1].y1 - grandes[i].y0;
    if (solape < (grandes[i].y1 - grandes[i].y0) * 0.15) apiladas += 1;
  }
  const caja = {
    x0: Math.min(...validas.map((c) => c.x0)),
    y0: Math.min(...validas.map((c) => c.y0)),
    x1: Math.max(...validas.map((c) => c.x1)),
    y1: Math.max(...validas.map((c) => c.y1)),
  };
  const W = caja.x1 - caja.x0 + 1;
  const H = caja.y1 - caja.y0 + 1;

  // Filas recortadas a la caja, solo con las piezas válidas.
  const filas = [];
  let area = 0;
  let areaInferior = 0;
  for (let y = 0; y < H; y += 1) {
    const fila = new Uint8Array(W);
    for (let x = 0; x < W; x += 1) {
      const k = (y + caja.y0) * ancho + (x + caja.x0);
      if (m[k] && ids.has(etiqueta[k])) {
        fila[x] = 1;
        area += 1;
        if (y >= H / 2) areaInferior += 1;
      }
    }
    filas.push(fila);
  }
  const info = filas.map((fila) => {
    const t = tramos(fila);
    const span = t.length ? t[t.length - 1][1] - t[0][0] + 1 : 0;
    // ¿Hay un hueco cuyo centro cae en la franja central, con tela a ambos lados?
    let huecoCentral = false;
    for (let i = 0; i < t.length - 1; i += 1) {
      const medio = (t[i][1] + t[i + 1][0]) / 2;
      if (medio > W * 0.3 && medio < W * 0.7) huecoCentral = true;
    }
    const centro = t.length ? t.reduce((s, [a, b]) => s + ((a + b) / 2) * (b - a + 1), 0) / t.reduce((s, [a, b]) => s + b - a + 1, 0) : W / 2;
    return { tramos: t.length, largos: t.map(([a, b]) => b - a + 1), span, huecoCentral, centro };
  });
  const filaEn = (f) => info[Math.min(H - 1, Math.max(0, Math.floor(f * H)))];
  const anchoEn = (f) => filaEn(f).span / W;
  const rango = (a, b) => info.slice(Math.floor(a * H), Math.max(Math.floor(a * H) + 1, Math.ceil(b * H)));

  // Hueco entre piernas: filas seguidas con hueco central contando desde abajo.
  let desdeAbajo = 0;
  for (let y = H - 1; y >= 0 && info[y].huecoCentral; y -= 1) desdeAbajo += 1;
  const huecoInicio = desdeAbajo >= H * 0.08 ? 1 - desdeAbajo / H : 1;
  const huecoTotal = info.filter((f) => f.huecoCentral).length / H;

  // Escote: hueco central arriba que se cierra antes del 30 % de la altura.
  const arriba = rango(0, 0.07);
  const conHuecoArriba = arriba.filter((f) => f.huecoCentral).length / arriba.length;
  let cierre = 0;
  while (cierre < H && info[cierre].huecoCentral) cierre += 1;
  const escote = conHuecoArriba >= 0.5 && cierre < H * 0.3 && huecoInicio === 1;

  // Mangas: el torso es la mediana del ancho entre el 60 y el 85 %; una fila más ancha es manga.
  const anchoTorso = Math.max(1, mediana(rango(0.6, 0.85).map((f) => f.span)));
  let finManga = 0;
  let maxExceso = 0;
  for (let y = 0; y < H; y += 1) {
    const exceso = info[y].span / anchoTorso;
    maxExceso = Math.max(maxExceso, exceso);
    if (exceso > 1.18 && y / H < 0.9) finManga = y / H;
  }
  // Mangas largas caídas junto al cuerpo: filas con tres tramos (manga | torso | manga).
  const tresTramos = rango(0.3, 0.9).filter((f) => f.tramos >= 3).length / Math.max(1, rango(0.3, 0.9).length);

  const anchoArriba = Math.max(...rango(0, 0.33).map((f) => f.span)) / W;
  const centroArriba = mediana(rango(0, 0.4).map((f) => f.centro));
  const estrechez = Math.min(...rango(0.25, 0.55).map((f) => f.span)) / Math.max(1, Math.min(filaEn(0.15).span, filaEn(0.85).span));

  // Capucha: arriba una sola pieza estrecha y centrada que se ensancha de golpe en los hombros.
  const capucha =
    !escote &&
    filaEn(0.03).tramos === 1 &&
    anchoEn(0.03) < 0.42 &&
    Math.abs(filaEn(0.03).centro - W / 2) < W * 0.08 &&
    Math.max(...rango(0.12, 0.3).map((f) => f.span)) / W > 0.55;

  // Perneras: ancho de cada pierna abajo frente a la rodilla (puño elástico = jogger).
  const anchoPierna = (f) => {
    const fila = filaEn(f);
    return fila.largos.length >= 2 ? (fila.largos[0] + fila.largos[fila.largos.length - 1]) / 2 : null;
  };
  const piernaAbajo = anchoPierna(0.95);
  const piernaRodilla = anchoPierna(0.65);
  const estrechaAbajo = piernaAbajo && piernaRodilla ? piernaAbajo / piernaRodilla : 1;

  return {
    caja,
    anchoTorsoPx: anchoTorso,
    rasgos: {
      apiladas,
      capucha,
      estrechaAbajo: redondear(estrechaAbajo),
      proporcion: redondear(W / H),
      relleno: redondear(area / (W * H)),
      piezas,
      masaInferior: redondear(areaInferior / Math.max(1, area)),
      huecoInicio: redondear(huecoInicio),
      huecoTotal: redondear(huecoTotal),
      escote,
      anchoArriba: redondear(anchoArriba),
      anchoSuperior: redondear(anchoEn(0.03)),
      anchoAbajo: redondear(anchoEn(0.92)),
      trapecio: redondear(anchoEn(0.92) / Math.max(0.05, anchoEn(0.08))),
      mangaExceso: redondear(maxExceso),
      finManga: redondear(finManga),
      tresTramos: redondear(tresTramos),
      desplazamientoArriba: redondear((centroArriba - W / 2) / W),
      estrechezCintura: redondear(estrechez),
      unTramoArriba: filaEn(0.03).tramos === 1,
    },
  };
}

/**
 * Abertura al frente (cierre o botones): una línea vertical al centro del torso
 * con un cambio de luz marcado entre la izquierda y la derecha de la línea, en
 * la mayoría de las filas. Las rayas horizontales no la activan.
 */
async function detectarCierre(png, mascara, caja) {
  const { data } = await sharp(png)
    .ensureAlpha()
    .resize(mascara.ancho, mascara.alto, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const lum = (x, y) => {
    const i = (y * mascara.ancho + x) * 4;
    return data[i + 3] < 128 ? null : 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  };
  const W = caja.x1 - caja.x0 + 1;
  const H = caja.y1 - caja.y0 + 1;
  const centro = Math.round(caja.x0 + W / 2);
  // ¿Hay una línea (o un cambio de luz entre ambos lados) en la columna cx de la fila y?
  const lineaEn = (cx, y) => {
    const v = [-6, -3, -1, 0, 1, 3, 6].map((d) => lum(Math.min(caja.x1, Math.max(caja.x0, cx + d)), y));
    if (v.some((x) => x === null)) return null;
    const [l6, l3, l1, c, r1, r3, r6] = v;
    const vecinos = (l3 + r3) / 2;
    const linea = Math.abs(Math.min(l1, c, r1) - vecinos) > 22 || Math.abs(Math.max(l1, c, r1) - vecinos) > 22;
    const lados = Math.abs((l6 + l3) / 2 - (r6 + r3) / 2) > 26;
    return linea || lados;
  };
  let filas = 0;
  let conLinea = 0;
  const lateral = Math.round(W * 0.2);
  for (let y = caja.y0 + Math.round(H * 0.3); y < caja.y0 + Math.round(H * 0.92); y += 1) {
    const enCentro = lineaEn(centro, y);
    if (enCentro === null) continue;
    filas += 1;
    // Al centro sí y a los lados no: es una abertura, no la textura de la tela.
    if (enCentro && !lineaEn(centro - lateral, y) && !lineaEn(centro + lateral, y)) conLinea += 1;
  }
  return filas >= 6 ? conLinea / filas : 0;
}

// ------------------------------------------------------------------ clasificación

/** Puntos por categoría con el motivo de cada punto (para mostrarlos al usuario). */
function puntuar(r) {
  const puntos = { Torso: 0, Piernas: 0, Vestido: 0, Calzado: 0 };
  const motivos = { Torso: [], Piernas: [], Vestido: [], Calzado: [] };
  const sumar = (cat, valor, motivo) => {
    puntos[cat] += valor;
    if (valor > 0) motivos[cat].push(motivo);
  };
  const conPiernas = r.huecoInicio < 0.8 && r.huecoTotal > 0.15 && r.piezas === 1;
  const conMangas = r.mangaExceso > 1.3 && r.finManga > 0 && r.finManga < 0.75;
  const bota = r.proporcion > 0.5 && r.proporcion < 1.15 && Math.abs(r.desplazamientoArriba) > 0.12 && r.anchoAbajo > 0.7 && r.anchoArriba < 0.75 && !r.escote;

  // Calzado
  if (r.proporcion > 1.3) sumar('Calzado', 3, 'silueta apaisada, como un zapato de perfil');
  else if (r.proporcion > 1.1 && r.masaInferior > 0.55) sumar('Calzado', 1.5, 'más ancha que alta y con el peso abajo (suela)');
  const mitades = r.piezas === 2 && r.tresTramos > 0.25;
  if (r.piezas === 2 && !conPiernas && !mitades) sumar('Calzado', 2.5, 'dos piezas separadas (un par)');
  if (mitades) sumar('Torso', 1.5, 'prenda abierta al frente (dos mitades con mangas)');
  if (bota) sumar('Calzado', 2.5, 'caña alta a un lado y pie ancho abajo (bota)');

  // Piernas
  if (conPiernas) sumar('Piernas', 3, 'dos perneras separadas abajo');
  if (r.unTramoArriba && r.anchoSuperior > 0.6 && !r.escote && !conMangas) sumar('Piernas', 1, 'pretina recta arriba');
  const falda = !conPiernas && !r.escote && !conMangas && r.tresTramos < 0.2 && !r.capucha && r.trapecio > 1.25 && r.proporcion > 0.55 && r.proporcion < 1.5 && r.anchoSuperior > 0.45;
  if (falda) sumar('Piernas', 2.5, 'se abre hacia abajo desde una pretina (falda)');

  // Torso
  if (conMangas && !conPiernas) sumar('Torso', 2.5, 'hombros con mangas más anchos que el cuerpo');
  if (r.tresTramos > 0.25 && !conPiernas) sumar('Torso', 2, 'mangas largas a los lados del cuerpo');
  if (r.escote) sumar('Torso', 1.5, 'escote o cuello arriba al centro');
  if (r.capucha) sumar('Torso', 1.5, 'capucha arriba al centro');
  if (r.proporcion > 0.6 && r.proporcion < 1.45 && !conPiernas && r.piezas === 1 && r.trapecio < 1.25) sumar('Torso', 1, 'proporción de prenda superior');

  // Vestido
  if (r.proporcion < 0.7 && !conPiernas && r.trapecio > 1.15 && r.piezas === 1) sumar('Vestido', 2, 'silueta larga que se abre hacia abajo');
  if (r.escote && r.proporcion < 0.65) sumar('Vestido', 1.5, 'escote en una prenda larga');
  if (r.proporcion < 0.7 && r.estrechezCintura < 0.85 && !conPiernas) sumar('Vestido', 1, 'se entalla en la cintura');
  if (r.proporcion < 0.55 && !conMangas) puntos.Torso -= 0.5;

  // Penalizaciones claras.
  if (r.escote) puntos.Calzado -= 2;
  if (conPiernas) puntos.Vestido -= 2;
  if (bota) puntos.Vestido -= 2;
  return { puntos, motivos, conPiernas, conMangas, bota, falda };
}

const CATEGORIA_ARMARIO = { Torso: 'top', Piernas: 'bottom', Vestido: 'dress', Calzado: 'shoes' };

const evidencias0 = (motivos, categoria, texto) => motivos[categoria].push(texto);

/** Tipo concreto dentro de la categoría a partir de la silueta y el color. */
function elegirTipo(categoria, r, extra, color) {
  const hsv = color?.hsv;
  const esMezclilla = hsv && hsv.h >= 195 && hsv.h <= 232 && hsv.s >= 0.2 && hsv.s <= 0.58 && hsv.v >= 0.28 && hsv.v <= 0.72;
  switch (categoria) {
    case 'Torso':
      if (r.capucha) return 'sudadera';
      if (extra.manga === 'sin') return 'top';
      if (extra.manga === 'corta') return extra.abertura ? 'camisa' : 'camiseta';
      if (r.proporcion < 0.62) return 'abrigo';
      if (extra.abertura) return esMezclilla || (hsv && hsv.v < 0.45) ? 'chamarra' : 'camisa';
      return esMezclilla ? 'chamarra' : 'sueter';
    case 'Piernas':
      if (extra.falda) return 'falda';
      if (r.huecoInicio > 0.5 || r.proporcion > 0.85) return 'short';
      if (r.estrechaAbajo < 0.72) return 'jogger';
      return esMezclilla ? 'jeans' : 'pantalon';
    case 'Vestido':
      return 'vestido';
    case 'Calzado':
      if (extra.bota) return 'botas';
      if (hsv && hsv.v < 0.35) return 'zapatos';
      return 'tenis';
    default:
      return null;
  }
}

// ------------------------------------------------------------------ color y estampado

function aHsv(r, g, b) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

const hex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Nombre del color de la paleta más cercano (para mostrar "azul marino", "beige"...). */
function nombreColor(r, g, b) {
  const { h, s, v } = aHsv(r, g, b);
  // Acromáticos por luminosidad; los cálidos muy claros y poco saturados son beige.
  if (s < 0.25 && v > 0.62 && h >= 25 && h <= 60 && s >= 0.1) return 'beige';
  if (s < 0.12 || v < 0.12) return v < 0.22 ? 'negro' : v < 0.8 ? 'gris' : 'blanco';
  let mejor = null;
  let distancia = Infinity;
  for (const c of COLORES.filter((col) => !['negro', 'gris', 'blanco'].includes(col.nombre))) {
    const [cr, cg, cb] = [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16));
    // Distancia ponderada (el ojo es más sensible al verde).
    const d = 2 * (r - cr) ** 2 + 4 * (g - cg) ** 2 + 3 * (b - cb) ** 2;
    if (d < distancia) {
      distancia = d;
      mejor = c.nombre;
    }
  }
  return mejor;
}

/** Colores principal y secundario, estampado y tela probable. */
async function analizarColor(png) {
  const { data, info } = await sharp(png).ensureAlpha().resize(96, 96, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  const cubetas = new Map();
  const lum = new Float32Array(info.width * info.height).fill(-1);
  let opacos = 0;
  for (let k = 0; k < info.width * info.height; k += 1) {
    const i = k * 4;
    if (data[i + 3] < 200) continue;
    opacos += 1;
    lum[k] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    const clave = ((data[i] >> 5) << 6) | ((data[i + 1] >> 5) << 3) | (data[i + 2] >> 5);
    const c = cubetas.get(clave) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n += 1;
    c.r += data[i];
    c.g += data[i + 1];
    c.b += data[i + 2];
    cubetas.set(clave, c);
  }
  if (!opacos) return null;
  const grupos = [...cubetas.values()].map((c) => ({ n: c.n, r: c.r / c.n, g: c.g / c.n, b: c.b / c.n })).sort((a, b) => b.n - a.n);
  const principal = grupos[0];
  const secundario = grupos.find(
    (g) => g.n / opacos >= 0.1 && Math.hypot(g.r - principal.r, g.g - principal.g, g.b - principal.b) > 70
  );

  // Estampado: variación de luminancia y de bordes dentro de la prenda.
  let suma = 0;
  let suma2 = 0;
  let bordes = 0;
  let pares = 0;
  const filas = new Map();
  const columnas = new Map();
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const v = lum[y * info.width + x];
      if (v < 0) continue;
      suma += v;
      suma2 += v * v;
      filas.set(y, [...(filas.get(y) ?? [0, 0]).map((a, i) => a + (i ? 1 : v))]);
      columnas.set(x, [...(columnas.get(x) ?? [0, 0]).map((a, i) => a + (i ? 1 : v))]);
      const derecha = x + 1 < info.width ? lum[y * info.width + x + 1] : -1;
      const abajo = y + 1 < info.height ? lum[(y + 1) * info.width + x] : -1;
      for (const otro of [derecha, abajo]) {
        if (otro < 0) continue;
        pares += 1;
        if (Math.abs(otro - v) > 28) bordes += 1;
      }
    }
  }
  const media = suma / opacos;
  const desviacion = Math.sqrt(Math.max(0, suma2 / opacos - media * media));
  const densidadBordes = pares ? bordes / pares : 0;
  const varianza = (mapa) => {
    const medias = [...mapa.values()].filter(([, n]) => n >= 4).map(([s, n]) => s / n);
    const m = medias.reduce((a, b) => a + b, 0) / Math.max(1, medias.length);
    return medias.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, medias.length);
  };
  const vFilas = varianza(filas);
  const vColumnas = varianza(columnas);
  let estampado = 'liso';
  if (desviacion > 22 || densidadBordes > 0.08) {
    if (vFilas > vColumnas * 3 && vFilas > 120) estampado = 'rayas horizontales';
    else if (vColumnas > vFilas * 3 && vColumnas > 120) estampado = 'rayas verticales';
    else if (secundario || densidadBordes > 0.08) estampado = 'estampado';
  }

  const hsv = aHsv(principal.r, principal.g, principal.b);
  return {
    principal: { hex: hex(principal.r, principal.g, principal.b), nombre: nombreColor(principal.r, principal.g, principal.b), proporcion: redondear(principal.n / opacos, 2) },
    secundario: secundario
      ? { hex: hex(secundario.r, secundario.g, secundario.b), nombre: nombreColor(secundario.r, secundario.g, secundario.b), proporcion: redondear(secundario.n / opacos, 2) }
      : null,
    hsv: { h: Math.round(hsv.h), s: redondear(hsv.s, 2), v: redondear(hsv.v, 2) },
    estampado,
    variacion: redondear(desviacion, 1),
  };
}

// ------------------------------------------------------------------ análisis completo

const ALTERNATIVAS = {
  Torso: ['camiseta', 'camisa', 'sueter', 'sudadera', 'chamarra', 'top', 'blusa', 'blazer', 'abrigo'],
  Piernas: ['pantalon', 'jeans', 'jogger', 'short', 'falda', 'leggings'],
  Vestido: ['vestido'],
  Calzado: ['tenis', 'zapatos', 'botas', 'sandalias'],
};

function sugerencias(categoria, tipo) {
  return [tipo, ...ALTERNATIVAS[categoria].filter((t) => t !== tipo)].filter(Boolean).slice(0, 5);
}

const NOMBRE_TIPO = {
  camiseta: 'Camiseta', camisa: 'Camisa', jogger: 'Pants', top: 'Top sin mangas', sueter: 'Suéter', sudadera: 'Sudadera', chamarra: 'Chamarra', abrigo: 'Abrigo',
  pantalon: 'Pantalón', jeans: 'Jeans', short: 'Short', falda: 'Falda', vestido: 'Vestido',
  tenis: 'Tenis', botas: 'Botas', zapatos: 'Zapatos',
};

/**
 * Analiza la prenda recortada.
 * @param {Buffer} png PNG con transparencia (salida de imagen.quitarFondo)
 */
async function analizarPrenda(png) {
  const meta = await sharp(png).metadata();
  const mascara = await leerMascara(png);
  const medida = medirRasgos(mascara);
  if (!medida) return null;
  const { rasgos: r, caja, anchoTorsoPx } = medida;
  const { puntos, motivos, conMangas, bota, falda } = puntuar(r);
  const color = await analizarColor(png);
  r.cierre = redondear(await detectarCierre(png, mascara, caja));

  const ranking = Object.entries(puntos).sort((a, b) => b[1] - a[1]);
  const [[mejor, p1], [, p2]] = ranking;
  const margen = p1 - p2;
  let confianza = 'ninguna';
  if (p1 >= 3 && margen >= 1.5) confianza = 'alta';
  else if (p1 >= 2 && margen >= 0.75) confianza = 'media';
  else if (p1 >= 1.5) confianza = 'baja';
  const categoria = confianza === 'ninguna' ? null : mejor;

  let manga = null;
  if (categoria === 'Torso' || categoria === 'Vestido') {
    if (r.tresTramos > 0.25 || (conMangas && r.finManga >= 0.7)) manga = 'larga';
    else if (conMangas && r.finManga >= 0.5) manga = 'tres-cuartos';
    else if (conMangas) manga = 'corta';
    else manga = 'sin';
  }
  // ¿Varias prendas en la misma foto? (piezas apiladas, o una silueta larga con mangas y piernas).
  const posibleOutfit = r.apiladas >= 1 || (r.proporcion < 0.5 && r.huecoInicio < 0.85 && r.huecoTotal > 0.1 && (conMangas || r.tresTramos > 0.25));
  const abertura = (r.cierre >= 0.55 && color?.estampado !== 'rayas verticales') || (r.piezas === 2 && r.tresTramos > 0.25);
  const tipo = categoria ? elegirTipo(categoria, r, { manga, bota, falda, abertura }, color) : null;
  if (categoria === 'Torso' && abertura) evidencias0(motivos, 'Torso', 'abertura al frente (cierre o botones)');
  if (tipo === 'jogger') evidencias0(motivos, 'Piernas', 'perneras que se cierran en el tobillo');
  let largo = null;
  if (categoria === 'Piernas' && !falda) largo = r.huecoInicio > 0.5 || r.proporcion > 0.85 ? 'corto' : 'largo';
  if (categoria === 'Vestido' || falda) largo = r.proporcion < 0.5 ? 'largo' : r.proporcion < 0.8 ? 'midi' : 'corto';
  if (categoria === 'Torso') largo = r.proporcion < 0.62 ? 'largo' : 'a la cadera';

  let tela = null;
  if (tipo === 'jeans' || tipo === 'chamarra') tela = 'mezclilla';
  else if ((tipo === 'zapatos' || tipo === 'botas') && color?.hsv.s < 0.5) tela = 'piel';

  // Zonas normalizadas (0..1) sobre la imagen completa, para el mapeo de la foto en 3D.
  const escalaX = 1 / mascara.ancho;
  const escalaY = 1 / mascara.alto;
  const zona = (x0, y0, x1, y1) => ({ x0: redondear(x0 * escalaX), y0: redondear(y0 * escalaY), x1: redondear((x1 + 1) * escalaX), y1: redondear((y1 + 1) * escalaY) });
  const zonas = { prenda: zona(caja.x0, caja.y0, caja.x1, caja.y1) };
  if ((categoria === 'Torso' || categoria === 'Vestido') && manga !== 'sin') {
    const centro = (caja.x0 + caja.x1) / 2;
    const t0 = Math.max(caja.x0, Math.round(centro - anchoTorsoPx / 2));
    const t1 = Math.min(caja.x1, Math.round(centro + anchoTorsoPx / 2));
    const finY = caja.y0 + Math.round((manga === 'larga' ? 0.95 : Math.max(0.2, r.finManga)) * (caja.y1 - caja.y0));
    zonas.torso = zona(t0, caja.y0, t1, caja.y1);
    if (t0 - caja.x0 > 2) zonas.mangaIzquierda = zona(caja.x0, caja.y0, t0, finY);
    if (caja.x1 - t1 > 2) zonas.mangaDerecha = zona(t1, caja.y0, caja.x1, finY);
  }

  const evidencias = categoria ? motivos[categoria] : [];
  return {
    categoria,
    categoriaArmario: categoria ? CATEGORIA_ARMARIO[categoria] : null,
    tipo,
    nombreSugerido: tipo ? `${NOMBRE_TIPO[tipo]}${color ? ` ${color.principal.nombre}` : ''}` : null,
    confianza,
    puntos: Object.fromEntries(Object.entries(puntos).map(([k, v]) => [k, redondear(v, 2)])),
    evidencias,
    detalle: {
      manga,
      largo,
      tela,
      posibleOutfit,
      capucha: categoria === 'Torso' ? r.capucha : null,
      abertura: categoria === 'Torso' ? abertura : null,
      estampado: color?.estampado ?? null,
      colores: color ? [color.principal, color.secundario].filter(Boolean) : [],
    },
    // Tipos alternativos ordenados (para el cuestionario): el elegido primero.
    sugerencias: categoria ? sugerencias(categoria, tipo) : [],
    color,
    rasgos: r,
    zonas,
    tamano: { ancho: meta.width, alto: meta.height },
  };
}

module.exports = { analizarPrenda, medirRasgos, leerMascara, puntuar, analizarColor, nombreColor, NOMBRE_TIPO };
