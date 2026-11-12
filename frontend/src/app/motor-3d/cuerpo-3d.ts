import * as THREE from 'three';

import { Proporciones } from '../probador/cuerpo';
import { Estilo } from '../probador/prendas';
import { Pliegue, dobladillo, plegar } from './acabado';
import { Anillo, SeccionTubo, elipsoide, loft, tubo } from './geometria';

const mezcla = (a: number, b: number, t: number) => a + (b - a) * t;

export interface Extremidad {
  lado: 1 | -1;
  secciones: SeccionTubo[];
}

/** Puntos de referencia del cuerpo que también usan las prendas. */
export interface Esqueleto {
  p: Proporciones;
  torso: Anillo[];
  brazos: Extremidad[];
  piernas: Extremidad[];
  radioCuello: number;
  tobillos: THREE.Vector3[];
  largoPie: number;
}

/** Anillos clave del torso, de la entrepierna a la base del cuello. */
export function anillosTorso(p: Proporciones, radioCuello: number): Anillo[] {
  const H = p.altura;
  const P = p.pecho;
  const C = p.cintura;
  const K = p.cadera;
  const g = p.gluteo;
  const v = p.vientre;
  const yCaderaCintura = mezcla(p.y.cadera, p.y.cintura, 0.5);
  const relievePecho = p.femenino
    ? { amplitud: p.busto * 0.38, angulo: 0.52, apertura: 0.085 }
    : { amplitud: 0.07, angulo: 0.6, apertura: 0.2 };

  return [
    // El torso termina justo en la entrepierna: los muslos nacen dentro de la cadera.
    // El torso baja lleno hasta que el muslo lo releva: la curva hacia dentro queda oculta en los muslos.
    { y: p.y.entrepierna - 0.012 * H, ancho: K.ancho * 0.66, frente: K.fondo * 0.6, atras: K.fondo * (0.66 + g * 0.2) },
    { y: p.y.entrepierna + 0.012 * H, ancho: K.ancho * 0.9, frente: K.fondo * 0.8, atras: K.fondo * (0.9 + g * 0.22) },
    { y: p.y.cadera, ancho: K.ancho, frente: K.fondo * 0.88, atras: K.fondo * (1.04 + g * 0.32) },
    {
      y: yCaderaCintura,
      ancho: mezcla(K.ancho, C.ancho, 0.55),
      frente: mezcla(K.fondo * 0.88, C.fondo * (1 + v * 0.6), 0.5),
      atras: mezcla(K.fondo * (1.02 + g * 0.15), C.fondo * 0.95, 0.5),
    },
    { y: p.y.cintura, ancho: C.ancho, frente: C.fondo * (0.98 + v * 0.7), atras: C.fondo * 0.95 },
    {
      y: 0.675 * H,
      ancho: mezcla(C.ancho, P.ancho, 0.78),
      frente: mezcla(C.fondo, P.fondo, 0.62),
      atras: P.fondo * 0.92,
      relieve: { ...relievePecho, amplitud: relievePecho.amplitud * 0.35 },
    },
    { y: p.y.pecho, ancho: P.ancho, frente: P.fondo * (p.femenino ? 0.94 : 1.02), atras: P.fondo * 0.95, relieve: relievePecho },
    { y: p.y.axila, ancho: P.ancho * 1.02, frente: P.fondo * 0.9, atras: P.fondo * 0.98 },
    // Trapecio en pendiente: del hombro (0.79 H) a la base del cuello (0.836 H), sin meseta.
    { y: 0.776 * H, ancho: p.hombros * 0.86, frente: P.fondo * 0.8, atras: P.fondo * 0.88 },
    { y: 0.793 * H, ancho: p.hombros * 0.79, frente: P.fondo * 0.7, atras: P.fondo * 0.78 },
    { y: 0.806 * H, ancho: mezcla(p.hombros * 0.79, radioCuello * 1.3, 0.38), frente: P.fondo * 0.6, atras: P.fondo * 0.68 },
    { y: 0.82 * H, ancho: mezcla(p.hombros * 0.79, radioCuello * 1.3, 0.74), frente: mezcla(P.fondo * 0.6, radioCuello * 1.15, 0.6), atras: mezcla(P.fondo * 0.68, radioCuello * 1.25, 0.6) },
    { y: 0.834 * H, ancho: radioCuello * 1.28, frente: radioCuello * 1.12, atras: radioCuello * 1.2 },
    { y: p.y.cuello, ancho: radioCuello * 1.1, frente: radioCuello * 1.06, atras: radioCuello * 1.08 },
  ];
}

/** Anillo a una altura cualquiera, interpolando linealmente entre los anillos clave. */
export function anilloEn(anillos: Anillo[], y: number): Anillo {
  if (y <= anillos[0].y) return { ...anillos[0], y };
  for (let i = 0; i < anillos.length - 1; i += 1) {
    const a = anillos[i];
    const b = anillos[i + 1];
    if (y <= b.y) {
      const t = (y - a.y) / (b.y - a.y);
      const relieve = a.relieve ?? b.relieve;
      return {
        y,
        ancho: mezcla(a.ancho, b.ancho, t),
        frente: mezcla(a.frente, b.frente, t),
        atras: mezcla(a.atras, b.atras, t),
        relieve: relieve && {
          ...relieve,
          amplitud: mezcla(a.relieve?.amplitud ?? 0, b.relieve?.amplitud ?? 0, t),
        },
      };
    }
  }
  return { ...anillos[anillos.length - 1], y };
}

export function construirEsqueleto(p: Proporciones): Esqueleto {
  const H = p.altura;
  const radioCuello = (p.femenino ? 0.031 : 0.034) * H * p.masa ** 0.35;
  const torso = anillosTorso(p, radioCuello);

  const rBrazo = (p.femenino ? 0.0245 : 0.0285) * H * p.masa ** 0.6 * p.musculo;
  const brazos: Extremidad[] = ([1, -1] as const).map((lado) => {
    const x = p.hombros - rBrazo * 0.9;
    const hombro = new THREE.Vector3(lado * x, p.y.hombro - 0.03 * H, -0.004 * H);
    const codo = new THREE.Vector3(lado * (x + 0.028 * H), p.y.codo, -0.012 * H);
    const muneca = new THREE.Vector3(lado * (x + 0.05 * H), p.y.muneca, 0.006 * H);
    return {
      lado,
      secciones: [
        { punto: hombro.clone().add(new THREE.Vector3(-lado * 0.03 * H, 0.004 * H, 0)), radio: rBrazo * 0.95 },
        { punto: hombro, radio: rBrazo * 1.1 },
        { punto: hombro.clone().lerp(codo, 0.45), radio: rBrazo },
        { punto: codo, radio: rBrazo * 0.74 },
        { punto: codo.clone().lerp(muneca, 0.3), radio: rBrazo * 0.82, aplanado: 0.9 },
        { punto: muneca, radio: rBrazo * 0.5, aplanado: 0.72 },
      ],
    };
  });

  // Muslo tan ancho como media cadera en el pliegue glúteo (sin escalón con el torso).
  const rMuslo = p.cadera.ancho * (p.femenino ? 0.56 : 0.53);
  const rRodilla = 0.03 * H * p.masa ** 0.4;
  const rPantorrilla = 0.034 * H * p.masa ** 0.55 * (p.femenino ? 0.95 : 1) * Math.sqrt(p.musculo);
  const rTobillo = 0.0185 * H;
  const xCadera = p.cadera.ancho * 0.45;
  const tobillos: THREE.Vector3[] = [];
  const piernas: Extremidad[] = ([1, -1] as const).map((lado) => {
    const x = lado * xCadera;
    const tobillo = new THREE.Vector3(x * 0.88, p.y.tobillo, -0.004 * H);
    tobillos.push(tobillo);
    return {
      lado,
      secciones: [
        // El muslo nace un poco adelantado y alto para continuar el bajo vientre sin escalón.
        { punto: new THREE.Vector3(x * 0.84, p.y.cadera + 0.02 * H, 0.018 * H), radio: rMuslo * 1.06 },
        { punto: new THREE.Vector3(x, p.y.entrepierna, 0.016 * H), radio: rMuslo },
        { punto: new THREE.Vector3(x * 0.97, mezcla(p.y.entrepierna, p.y.rodilla, 0.5), 0.004 * H), radio: rMuslo * 0.74 },
        { punto: new THREE.Vector3(x * 0.93, p.y.rodilla + 0.035 * H, 0.004 * H), radio: rRodilla * 1.12 },
        { punto: new THREE.Vector3(x * 0.92, p.y.rodilla, 0.006 * H), radio: rRodilla },
        { punto: new THREE.Vector3(x * 0.91, mezcla(p.y.rodilla, p.y.tobillo, 0.3), -0.006 * H), radio: rPantorrilla },
        { punto: new THREE.Vector3(x * 0.89, mezcla(p.y.rodilla, p.y.tobillo, 0.72), -0.003 * H), radio: rPantorrilla * 0.66 },
        { punto: tobillo, radio: rTobillo },
        { punto: tobillo.clone().add(new THREE.Vector3(0, -0.012 * H, 0.004 * H)), radio: rTobillo * 0.95 },
      ],
    };
  });

  return { p, torso, brazos, piernas, radioCuello, tobillos, largoPie: 0.15 * H };
}

/** Pie (o zapato si se infla): sección a lo largo del eje Z, de talón a punta. */
function geometriaPie(esq: Esqueleto, inflado = 1, extra = 0): THREE.BufferGeometry {
  const H = esq.p.altura;
  const L = esq.largoPie;
  const W = L * (esq.p.femenino ? 0.36 : 0.39);
  // y = posición a lo largo del pie; "frente" = hacia abajo y "atras" = hacia arriba tras rotar.
  const secciones: Anillo[] = [
    { y: -0.24 * L, ancho: W * 0.2, frente: 0.006 * H, atras: 0.012 * H },
    { y: -0.2 * L, ancho: W * 0.33, frente: 0.01 * H, atras: 0.03 * H },
    { y: -0.1 * L, ancho: W * 0.42, frente: 0.012 * H, atras: 0.045 * H },
    { y: 0.05 * L, ancho: W * 0.46, frente: 0.012 * H, atras: 0.04 * H },
    { y: 0.3 * L, ancho: W * 0.5, frente: 0.012 * H, atras: 0.026 * H },
    { y: 0.55 * L, ancho: W * 0.52, frente: 0.012 * H, atras: 0.018 * H },
    { y: 0.7 * L, ancho: W * 0.44, frente: 0.011 * H, atras: 0.014 * H },
    { y: 0.76 * L, ancho: W * 0.12, frente: 0.005 * H, atras: 0.006 * H },
  ].map((a) => ({
    ...a,
    ancho: a.ancho * inflado + extra,
    frente: a.frente * inflado + extra,
    atras: a.atras * inflado + extra,
  }));
  const geo = loft(secciones, { segmentos: 32, subdivisiones: 4, tapaInferior: true, tapaSuperior: true });
  geo.rotateX(Math.PI / 2); // eje Y del loft -> eje Z (hacia delante), "frente" -> abajo
  return geo;
}

function malla(geo: THREE.BufferGeometry, material: THREE.Material, nombre: string): THREE.Mesh {
  // Las telas usan colores de vértice (oclusión de pliegues): sin ellos se verían negras.
  if (!geo.getAttribute('color')) {
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 3).fill(1), 3));
  }
  const m = new THREE.Mesh(geo, material);
  m.name = nombre;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Cuerpo completo del maniquí. */
export function construirCuerpo(esq: Esqueleto, material: THREE.Material): THREE.Group {
  const { p, radioCuello } = esq;
  const H = p.altura;
  const grupo = new THREE.Group();
  grupo.name = 'cuerpo';

  grupo.add(malla(loft(esq.torso, { tapaInferior: true }), material, 'torso'));

  const cuello = loft(
    [
      { y: 0.83 * H, ancho: radioCuello * 1.2, frente: radioCuello * 1.15, atras: radioCuello * 1.2 },
      { y: p.y.cuello, ancho: radioCuello, frente: radioCuello * 0.98, atras: radioCuello },
      { y: p.y.barbilla + 0.004 * H, ancho: radioCuello * 0.92, frente: radioCuello * 0.9, atras: radioCuello * 0.95, z: 0.004 * H },
    ],
    { segmentos: 32, subdivisiones: 3 }
  );
  grupo.add(malla(cuello, material, 'cuello'));

  const escala = p.femenino ? 0.95 : 1;
  const cabeza = malla(elipsoide(0.043 * H * escala, 0.066 * H * escala, 0.054 * H * escala, 0.2, 48), material, 'cabeza');
  cabeza.position.set(0, p.y.cabeza - (p.femenino ? 0.003 * H : 0), 0.012 * H);
  cabeza.rotation.x = 0.12;
  grupo.add(cabeza);

  for (const brazo of esq.brazos) {
    grupo.add(malla(tubo(brazo.secciones, { segmentos: 28, pasos: 36, tapas: true }), material, `brazo_${brazo.lado > 0 ? 'izq' : 'der'}`));
    const muneca = brazo.secciones[brazo.secciones.length - 1].punto;
    const antebrazo = brazo.secciones[brazo.secciones.length - 2].punto;
    const dir = muneca.clone().sub(antebrazo).normalize();
    const mano = malla(elipsoide(0.013 * H, 0.052 * H, 0.025 * H, 0.3, 28), material, `mano_${brazo.lado > 0 ? 'izq' : 'der'}`);
    mano.position.copy(muneca).addScaledVector(dir, 0.044 * H);
    mano.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    grupo.add(mano);
  }

  for (const pierna of esq.piernas) {
    grupo.add(malla(tubo(pierna.secciones, { segmentos: 32, pasos: 48 }), material, `pierna_${pierna.lado > 0 ? 'izq' : 'der'}`));
  }
  esq.tobillos.forEach((tobillo, i) => {
    const pie = malla(geometriaPie(esq), material, `pie_${i === 0 ? 'izq' : 'der'}`);
    pie.position.set(tobillo.x, 0.012 * H, tobillo.z);
    pie.rotation.y = (i === 0 ? 1 : -1) * 0.08;
    grupo.add(pie);
  });

  return grupo;
}

// ---------------------------------------------------------------- prendas

function inflar(a: Anillo, holgura: number, extra: number): Anillo {
  return {
    ...a,
    ancho: a.ancho * holgura + extra,
    frente: a.frente * holgura + extra,
    atras: a.atras * holgura + extra,
    relieve: a.relieve && { ...a.relieve, amplitud: a.relieve.amplitud * (holgura > 1.04 ? 0.55 : 0.9) },
  };
}

/**
 * Anillos de una prenda que cubre el torso entre `desde` y `hasta` (alturas en m).
 * - modo 'cuelga' (camisas, abrigos, faldas): bajo la cadera la tela cae
 *   como falda con el vuelo indicado.
 * - modo 'ajusta' (pelvis del pantalón, pretina): sigue la forma del cuerpo.
 * La tela suelta cae recta desde el pecho en lugar de ceñirse bajo el busto.
 */
function anillosPrenda(
  esq: Esqueleto,
  desde: number,
  hasta: number,
  estilo: Estilo,
  modo: 'cuelga' | 'ajusta' = 'cuelga',
  extra = 0.004
): Anillo[] {
  const { p } = esq;
  const H = p.altura;
  const alturas = new Set<number>([desde, hasta]);
  for (const a of esq.torso) if (a.y > desde && a.y < hasta) alturas.add(a.y);
  const base = anilloEn(esq.torso, p.y.cadera);
  if (modo === 'cuelga' && desde < p.y.entrepierna) {
    for (let y = p.y.entrepierna; y > desde; y -= 0.05 * H) alturas.add(y);
  }
  // Por delante de los muslos (nacen algo adelantados respecto a la pelvis).
  const frenteMuslos = p.cadera.fondo * 0.95 + 0.02 * H;

  const anillos = [...alturas]
    .sort((a, b) => a - b)
    .map((y) => {
      let anillo: Anillo;
      if (modo === 'cuelga' && y < p.y.cadera) {
        // Falda / bajo de abrigo: parte de la cadera y se abre hacia abajo.
        const t = (p.y.cadera - y) / H;
        const abre = 1 + estilo.vuelo * t * 6;
        anillo = { y, ancho: base.ancho * abre, frente: Math.max(base.frente * 1.08, frenteMuslos) * abre, atras: base.atras * abre };
      } else {
        anillo = anilloEn(esq.torso, y);
        if (y < p.y.cadera + 0.03 * H) anillo.frente = Math.max(anillo.frente, frenteMuslos * (modo === 'ajusta' ? 0.97 : 1));
        if (estilo.vuelo > 0 && y < p.y.cintura) {
          const t = (p.y.cintura - y) / H;
          anillo.ancho *= 1 + estilo.vuelo * t * 3;
        }
      }
      return anillo;
    });

  // La tela suelta tiende puentes sobre los huecos del cuerpo (cintura, bajo el pecho):
  // se mezcla el perfil del cuerpo con su envolvente convexa según la holgura.
  const puente = Math.min(1, Math.max(0, (estilo.holgura - 1.02) / 0.06));
  if (puente > 0 && modo === 'cuelga') {
    for (const clave of ['ancho', 'frente', 'atras'] as const) {
      const envolvente = envolventeConvexa(anillos.map((a) => [a.y, a[clave]]));
      anillos.forEach((a, i) => (a[clave] = mezcla(a[clave], Math.max(a[clave], envolvente[i]), puente)));
    }
  }

  const limiteCadera = p.y.cintura + 0.03 * H;
  return anillos.map((anillo) =>
    inflar(anillo, anillo.y < limiteCadera ? Math.max(estilo.holgura, estilo.holguraCadera ?? 0) : estilo.holgura, extra)
  );
}

/** Envolvente convexa superior de un perfil (y, valor), evaluada en cada y. */
function envolventeConvexa(puntos: Array<[number, number]>): number[] {
  const casco: Array<[number, number]> = [];
  for (const punto of puntos) {
    while (casco.length >= 2) {
      const [a, b] = [casco[casco.length - 2], casco[casco.length - 1]];
      // Quita b si queda por debajo de la recta a -> punto (no es convexa por arriba).
      const cruz = (b[0] - a[0]) * (punto[1] - a[1]) - (b[1] - a[1]) * (punto[0] - a[0]);
      if (cruz >= 0) casco.pop();
      else break;
    }
    casco.push(punto);
  }
  return puntos.map(([y]) => {
    for (let i = 0; i < casco.length - 1; i += 1) {
      const [y0, v0] = casco[i];
      const [y1, v1] = casco[i + 1];
      if (y >= y0 && y <= y1) return y1 === y0 ? Math.max(v0, v1) : v0 + ((v1 - v0) * (y - y0)) / (y1 - y0);
    }
    return casco[casco.length - 1][1];
  });
}

/** Re-muestrea una extremidad entre dos fracciones de su largo (mangas, perneras, cañas). */
function tramoExtremidad(ext: Extremidad, desde: number, hasta: number, holgura: number, extra: number, vuelo = 0): SeccionTubo[] {
  const curva = new THREE.CatmullRomCurve3(ext.secciones.map((s) => s.punto), false, 'centripetal');
  const n = ext.secciones.length - 1;
  const pasos = 7;
  const resultado: SeccionTubo[] = [];
  for (let i = 0; i <= pasos; i += 1) {
    const t = desde + ((hasta - desde) * i) / pasos;
    const x = t * n;
    const k = Math.min(Math.floor(x), n - 1);
    const r = mezcla(ext.secciones[k].radio, ext.secciones[k + 1].radio, x - k);
    const apl = mezcla(ext.secciones[k].aplanado ?? 1, ext.secciones[k + 1].aplanado ?? 1, x - k);
    const abre = 1 + vuelo * (i / pasos) ** 2;
    resultado.push({ punto: curva.getPointAt(t), radio: (r * holgura + extra) * abre, aplanado: Math.max(apl, 0.85) });
  }
  return resultado;
}

/** Fracción (0..1) del largo de la pierna a la que está una altura dada. */
function fraccionPierna(esq: Esqueleto, y: number): number {
  const s = esq.piernas[0].secciones;
  const arriba = s[0].punto.y;
  const abajo = s[s.length - 1].punto.y;
  return Math.min(1, Math.max(0, (arriba - y) / (arriba - abajo)));
}

export interface MaterialesPrenda {
  tela: THREE.Material;
  detalle: THREE.Material;
  /** Cara interior (más oscura); si falta, la prenda no muestra interior. */
  interior?: THREE.Material;
}

/**
 * Pieza de tela acabada: superficie con pliegues, dobladillos en sus bordes
 * libres y cara interior. Devuelve un grupo con nombre `nombre`.
 */
function pieza(
  geo: THREE.BufferGeometry,
  mat: MaterialesPrenda,
  nombre: string,
  pliegue: Pliegue | null,
  bordes: Array<{ borde: 'primera' | 'ultima'; grosor: number }> = []
): THREE.Mesh[] {
  if (pliegue && pliegue.amplitud > 0) plegar(geo, pliegue);
  const piezas = [malla(geo, mat.tela, nombre)];
  for (const { borde, grosor } of bordes) {
    const tuboBorde = dobladillo(geo, borde, grosor);
    if (tuboBorde) piezas.push(malla(tuboBorde, mat.tela, `${nombre}_borde`));
  }
  if (mat.interior) {
    const interior = malla(geo, mat.interior, `${nombre}_interior`);
    interior.castShadow = false;
    piezas.push(interior);
  }
  return piezas;
}

/** Prenda superior: cuerpo, mangas y detalles (capucha, cuello, tirantes). */
export function construirSuperior(esq: Esqueleto, estilo: Estilo, mat: MaterialesPrenda): THREE.Group {
  const { p, radioCuello } = esq;
  const H = p.altura;
  const grupo = new THREE.Group();
  grupo.name = 'superior';
  const sinManga = estilo.manga === 0;
  const hasta = sinManga ? p.y.axila + 0.012 * H : 0.832 * H;
  const desde = estilo.largo * H;
  const holgura = Math.max(0, estilo.holgura - 1);
  // Las prendas superiores van por fuera del pantalón: más separación del cuerpo.
  const cuerpo = loft(anillosPrenda(esq, desde, hasta, estilo, 'cuelga', 0.016), { segmentos: 96 });
  grupo.add(
    ...pieza(
      cuerpo,
      mat,
      'superior_cuerpo',
      { amplitud: H * (0.0018 + holgura * 0.05 + estilo.vuelo * 0.02), pliegues: 7, libre: 'v0', semilla: 0.7 },
      [
        { borde: 'primera', grosor: 0.0022 * H },
        { borde: 'ultima', grosor: 0.0016 * H },
      ]
    )
  );

  if (!sinManga) {
    for (const brazo of esq.brazos) {
      const manga = tramoExtremidad(brazo, 0.02, Math.min(estilo.manga, 0.97), estilo.holgura * 1.06, 0.008, estilo.manga < 0.5 ? 0.14 : 0.06);
      grupo.add(
        ...pieza(
          tubo(manga, { segmentos: 36, pasos: 32 }),
          mat,
          brazo.lado > 0 ? 'manga_izq' : 'manga_der',
          {
            amplitud: H * (0.0012 + holgura * 0.03),
            pliegues: 3,
            libre: 'v1',
            arrugas: estilo.manga > 0.6 ? H * 0.0011 : 0,
            semilla: brazo.lado > 0 ? 1.1 : 2.3,
          },
          [{ borde: 'ultima', grosor: 0.0018 * H }]
        )
      );
    }
  } else {
    // Tirantes sobre los hombros.
    for (const lado of [1, -1]) {
      const x = lado * p.hombros * 0.45;
      const tirante = tubo(
        [
          { punto: new THREE.Vector3(x, p.y.axila, p.pecho.fondo * 0.95), radio: 0.004 * H },
          { punto: new THREE.Vector3(x, p.y.hombro + 0.006 * H, 0), radio: 0.004 * H },
          { punto: new THREE.Vector3(x, p.y.axila, -p.pecho.fondo * 0.95), radio: 0.004 * H },
        ],
        { segmentos: 10, pasos: 16 }
      );
      grupo.add(malla(tirante, mat.tela, 'tirante'));
    }
  }

  if (estilo.capucha) {
    // Capucha caída sobre la espalda: media elipse aplanada detrás del cuello.
    const capucha = elipsoide(radioCuello * 2.3, radioCuello * 2.2, radioCuello * 0.9, 0.25, 32);
    const m = malla(capucha, mat.tela, 'capucha');
    m.position.set(0, 0.775 * H, -p.pecho.fondo * 1.0);
    m.rotation.x = -0.35;
    grupo.add(m);
  }
  if (estilo.cuello) {
    const grosor = estilo.tela === 'lana' || estilo.tela === 'lona' ? 0.007 : 0.0045;
    const cuello = new THREE.TorusGeometry(radioCuello * 1.32, grosor * H, 12, 48);
    cuello.rotateX(Math.PI / 2 - 0.2);
    const m = malla(cuello, mat.tela, 'cuello_prenda');
    m.position.set(0, 0.838 * H, 0.002 * H);
    grupo.add(m);
  }
  return grupo;
}

/** Prenda inferior: pantalón (pelvis + perneras), short o falda. */
export function construirInferior(esq: Esqueleto, estilo: Estilo, tipo: string, mat: MaterialesPrenda): THREE.Group {
  const { p } = esq;
  const H = p.altura;
  const grupo = new THREE.Group();
  grupo.name = 'inferior';
  const cintura = p.y.cintura - (tipo === 'leggings' ? 0 : 0.012 * H);
  const bajo = estilo.largo * H;

  const holgura = Math.max(0, estilo.holgura - 1);
  if (tipo === 'falda') {
    grupo.add(
      ...pieza(
        loft(anillosPrenda(esq, bajo, cintura, estilo), { segmentos: 96 }),
        mat,
        'falda',
        { amplitud: H * (0.0025 + estilo.vuelo * 0.05), pliegues: 9, libre: 'v0', semilla: 0.4 },
        [{ borde: 'primera', grosor: 0.002 * H }]
      )
    );
  } else {
    // La holgura de un jogger o pantalón suelto está en las perneras; en la cadera se ajusta.
    const pelvis = anillosPrenda(esq, p.y.entrepierna - 0.01 * H, cintura, { ...estilo, holgura: Math.min(estilo.holgura, 1.05) }, 'ajusta');
    grupo.add(malla(loft(pelvis, { tapaInferior: true }), mat.tela, 'pelvis'));
    const hasta = fraccionPierna(esq, Math.max(bajo, p.y.tobillo - 0.004 * H));
    for (const pierna of esq.piernas) {
      const pernera = tramoExtremidad(pierna, 0, hasta, estilo.holgura, 0.006, estilo.vuelo * 4).map((s, i, todas) => {
        // Arriba la pernera recoge el glúteo y la entrepierna: más ancha, para que la
        // transición desde la pelvis sea continua (sin "escalón" bajo la cadera).
        const t = i / (todas.length - 1);
        const arriba = Math.max(0, 1 - (t * hasta) / 0.18);
        return { ...s, radio: s.radio * (1 + 0.2 * arriba ** 1.5) };
      });
      grupo.add(
        ...pieza(
          tubo(pernera, { segmentos: 40, pasos: 44 }),
          mat,
          'pernera',
          {
            amplitud: H * (0.0008 + holgura * 0.035),
            pliegues: 3,
            libre: 'v1',
            arrugas: H * (holgura > 0.03 ? 0.0014 : 0.0004),
            semilla: pierna.lado > 0 ? 0.3 : 1.9,
          },
          [{ borde: 'ultima', grosor: 0.002 * H }]
        )
      );
    }
  }
  // Pretina.
  const pretina = anillosPrenda(esq, cintura - 0.014 * H, cintura + 0.002 * H, { ...estilo, holgura: Math.min(estilo.holgura, 1.05) + 0.012 }, 'ajusta');
  grupo.add(malla(loft(pretina), tipo === 'jeans' ? mat.tela : mat.detalle, 'pretina'));
  return grupo;
}

/** Vestido: cuerpo ajustado con tirantes y falda con vuelo. */
export function construirVestido(esq: Esqueleto, estilo: Estilo, mat: MaterialesPrenda): THREE.Group {
  const grupo = construirSuperior(esq, { ...estilo, manga: 0, largo: esq.p.y.cintura / esq.p.altura, holgura: 1.02, vuelo: 0 }, mat);
  grupo.name = 'vestido';
  const H = esq.p.altura;
  const falda = anillosPrenda(esq, estilo.largo * H, esq.p.y.cintura + 0.004 * H, estilo);
  grupo.add(
    ...pieza(
      loft(falda, { segmentos: 96 }),
      mat,
      'falda_vestido',
      { amplitud: H * (0.003 + estilo.vuelo * 0.05), pliegues: 9, libre: 'v0', semilla: 1.3 },
      [{ borde: 'primera', grosor: 0.002 * H }]
    )
  );
  return grupo;
}

/** Calzado: empeine sobre el pie, suela y caña opcional (botas). */
export function construirCalzado(esq: Esqueleto, estilo: Estilo, mat: MaterialesPrenda): THREE.Group {
  const H = esq.p.altura;
  const grupo = new THREE.Group();
  grupo.name = 'calzado';
  esq.tobillos.forEach((tobillo, i) => {
    const giro = (i === 0 ? 1 : -1) * 0.08;
    const zapato = malla(geometriaPie(esq, estilo.holgura, 0.003), mat.tela, 'zapato');
    zapato.position.set(tobillo.x, 0.016 * H, tobillo.z);
    zapato.rotation.y = giro;
    grupo.add(zapato);

    const suela = malla(geometriaPie(esq, estilo.holgura + 0.04, 0.004), mat.detalle, 'suela');
    suela.scale.set(1, 0.28, 1);
    suela.position.set(tobillo.x, 0.005 * H, tobillo.z);
    suela.rotation.y = giro;
    grupo.add(suela);

    if ((estilo.cana ?? 0) > 0.06) {
      const pierna = esq.piernas[i];
      const desde = fraccionPierna(esq, estilo.cana! * H);
      // Por debajo del pantalón (holgura menor que la pernera) y por encima de leggings.
      const cana = tramoExtremidad(pierna, desde, 1, 1.05, 0.003);
      grupo.add(malla(tubo(cana, { segmentos: 24, pasos: 20 }), mat.tela, 'cana'));
    }
  });
  return grupo;
}
