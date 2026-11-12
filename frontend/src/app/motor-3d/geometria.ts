import * as THREE from 'three';

/**
 * Sección horizontal del cuerpo: elipse con semiancho en X y profundidad
 * distinta al frente (+Z) y atrás (-Z), para modelar pecho, vientre y glúteos.
 */
export interface Anillo {
  y: number;
  ancho: number;
  frente: number;
  atras: number;
  x?: number;
  z?: number;
  /** Dos relieves simétricos al frente (busto): amplitud relativa y ángulo (rad) desde el centro. */
  relieve?: { amplitud: number; angulo: number; apertura: number };
}

export interface OpcionesLoft {
  segmentos?: number;
  /** Anillos intermedios generados entre cada par (interpolación Catmull-Rom). */
  subdivisiones?: number;
  tapaInferior?: boolean;
  tapaSuperior?: boolean;
  /** Exponente de superelipse: 2 = elipse, >2 más cuadrada. */
  exponente?: number;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Interpola anillos con Catmull-Rom para que el contorno sea suave (sin "escalones"). */
export function suavizarAnillos(anillos: Anillo[], subdivisiones: number): Anillo[] {
  if (anillos.length < 3 || subdivisiones <= 1) return anillos;
  const claves: Array<keyof Omit<Anillo, 'relieve'>> = ['y', 'ancho', 'frente', 'atras', 'x', 'z'];
  const resultado: Anillo[] = [];
  for (let i = 0; i < anillos.length - 1; i += 1) {
    const a0 = anillos[Math.max(i - 1, 0)];
    const a1 = anillos[i];
    const a2 = anillos[i + 1];
    const a3 = anillos[Math.min(i + 2, anillos.length - 1)];
    for (let s = 0; s < subdivisiones; s += 1) {
      const t = s / subdivisiones;
      const anillo = {} as Anillo;
      for (const clave of claves) {
        const v = (a: Anillo) => (a[clave] as number | undefined) ?? 0;
        (anillo[clave] as number) = catmull(v(a0), v(a1), v(a2), v(a3), t);
      }
      // Los anchos nunca pueden quedar negativos por el sobreimpulso de la curva.
      anillo.ancho = Math.max(anillo.ancho, 0.0005);
      anillo.frente = Math.max(anillo.frente, 0.0005);
      anillo.atras = Math.max(anillo.atras, 0.0005);
      const r1 = a1.relieve?.amplitud ?? 0;
      const r2 = a2.relieve?.amplitud ?? 0;
      const amplitud = Math.max(0, catmull(a0.relieve?.amplitud ?? 0, r1, r2, a3.relieve?.amplitud ?? 0, t));
      if (amplitud > 0.001) {
        const ref = a1.relieve ?? a2.relieve!;
        anillo.relieve = { amplitud, angulo: ref.angulo, apertura: ref.apertura };
      }
      resultado.push(anillo);
    }
  }
  resultado.push(anillos[anillos.length - 1]);
  return resultado;
}

export function puntoAnillo(a: Anillo, theta: number, exponente: number): [number, number] {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const e = 2 / exponente;
  const sx = Math.sign(s) * Math.abs(s) ** e;
  const cz = Math.sign(c) * Math.abs(c) ** e;
  let profundidad = c >= 0 ? a.frente : a.atras;
  if (a.relieve && c > 0) {
    const { amplitud, angulo, apertura } = a.relieve;
    const d1 = theta - angulo;
    const d2 = theta + angulo;
    // theta en [-PI, PI]: relieves gaussianos a ambos lados del esternón.
    profundidad *= 1 + amplitud * (Math.exp(-(d1 * d1) / apertura) + Math.exp(-(d2 * d2) / apertura));
  }
  return [(a.x ?? 0) + a.ancho * sx, (a.z ?? 0) + profundidad * cz];
}

/** Une los vértices duplicados de la costura (u = 0 y u = 1) para que no se vea una línea. */
export function soldarCostura(geo: THREE.BufferGeometry, filas: number, columnas: number): void {
  const normales = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let f = 0; f < filas; f += 1) {
    const i0 = f * columnas;
    const i1 = i0 + columnas - 1;
    const n = new THREE.Vector3(
      normales.getX(i0) + normales.getX(i1),
      normales.getY(i0) + normales.getY(i1),
      normales.getZ(i0) + normales.getZ(i1)
    ).normalize();
    normales.setXYZ(i0, n.x, n.y, n.z);
    normales.setXYZ(i1, n.x, n.y, n.z);
  }
  normales.needsUpdate = true;
}

/** Superficie que une anillos horizontales (torso, pelvis, faldas, cuello). */
export function loft(anillosBase: Anillo[], opciones: OpcionesLoft = {}): THREE.BufferGeometry {
  const { segmentos = 56, subdivisiones = 5, tapaInferior = false, tapaSuperior = false, exponente = 2.15 } = opciones;
  const anillos = suavizarAnillos(anillosBase, subdivisiones);
  const columnas = segmentos + 1;
  const posiciones: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Perímetro aproximado del anillo más ancho para que la textura no se estire.
  anillos.forEach((anillo, fila) => {
    for (let s = 0; s <= segmentos; s += 1) {
      const theta = -Math.PI + (2 * Math.PI * s) / segmentos;
      const [x, z] = puntoAnillo(anillo, theta, exponente);
      posiciones.push(x, anillo.y, z);
      uvs.push(s / segmentos, fila / (anillos.length - 1));
    }
  });
  for (let f = 0; f < anillos.length - 1; f += 1) {
    for (let s = 0; s < segmentos; s += 1) {
      const a = f * columnas + s;
      const b = a + columnas;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const tapa = (fila: number, haciaArriba: boolean) => {
    const anillo = anillos[fila];
    const centro = posiciones.length / 3;
    posiciones.push(anillo.x ?? 0, anillo.y, anillo.z ?? 0);
    uvs.push(0.5, haciaArriba ? 1 : 0);
    for (let s = 0; s < segmentos; s += 1) {
      const a = fila * columnas + s;
      if (haciaArriba) indices.push(a, a + 1, centro);
      else indices.push(a, centro, a + 1);
    }
  };
  if (tapaInferior) tapa(0, false);
  if (tapaSuperior) tapa(anillos.length - 1, true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  soldarCostura(geo, anillos.length, columnas);
  geo.userData['rejilla'] = { filas: anillos.length, columnas };
  return geo;
}

export interface SeccionTubo {
  punto: THREE.Vector3;
  /** Radio en el plano lateral y en el plano frontal. */
  radio: number;
  aplanado?: number;
}

/**
 * Tubo suave a lo largo de una curva (brazos, piernas, mangas, perneras).
 * Los radios se interpolan con Catmull-Rom, igual que la trayectoria.
 */
export function tubo(secciones: SeccionTubo[], { segmentos = 28, pasos = 40, tapas = false } = {}): THREE.BufferGeometry {
  const curva = new THREE.CatmullRomCurve3(secciones.map((s) => s.punto), false, 'centripetal');
  const marcos = curva.computeFrenetFrames(pasos, false);
  const n = secciones.length - 1;
  const radioEn = (t: number, clave: 'radio' | 'aplanado') => {
    const x = t * n;
    const i = Math.min(Math.floor(x), n - 1);
    const v = (k: number) => (secciones[Math.min(Math.max(k, 0), n)][clave] as number | undefined) ?? (clave === 'aplanado' ? 1 : 0);
    return catmull(v(i - 1), v(i), v(i + 1), v(i + 2), x - i);
  };

  const columnas = segmentos + 1;
  const posiciones: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let p = 0; p <= pasos; p += 1) {
    const t = p / pasos;
    const centro = curva.getPointAt(t);
    const normal = marcos.normals[p];
    const binormal = marcos.binormals[p];
    const r = Math.max(radioEn(t, 'radio'), 0.0005);
    const aplanado = radioEn(t, 'aplanado');
    for (let s = 0; s <= segmentos; s += 1) {
      const a = (2 * Math.PI * s) / segmentos;
      const cx = Math.cos(a) * r;
      const cy = Math.sin(a) * r * aplanado;
      posiciones.push(
        centro.x + normal.x * cx + binormal.x * cy,
        centro.y + normal.y * cx + binormal.y * cy,
        centro.z + normal.z * cx + binormal.z * cy
      );
      uvs.push(s / segmentos, t);
    }
  }
  for (let p = 0; p < pasos; p += 1) {
    for (let s = 0; s < segmentos; s += 1) {
      const a = p * columnas + s;
      const b = a + columnas;
      // Con el marco de Frenet (N × B = T) este orden deja las normales hacia fuera.
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  if (tapas) {
    for (const [fila, punto, haciaFuera] of [
      [0, curva.getPointAt(0), false],
      [pasos, curva.getPointAt(1), true],
    ] as const) {
      const centro = posiciones.length / 3;
      posiciones.push(punto.x, punto.y, punto.z);
      uvs.push(0.5, fila === 0 ? 0 : 1);
      for (let s = 0; s < segmentos; s += 1) {
        const a = fila * columnas + s;
        if (haciaFuera) indices.push(a, centro, a + 1);
        else indices.push(a, a + 1, centro);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  soldarCostura(geo, pasos + 1, columnas);
  geo.userData['rejilla'] = { filas: pasos + 1, columnas };
  return geo;
}

/** Elipsoide con forma de huevo opcional (más estrecho abajo): cabeza, manos. */
export function elipsoide(rx: number, ry: number, rz: number, estrechamiento = 0, detalle = 40): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, detalle, Math.round(detalle * 0.75));
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const factor = 1 - estrechamiento * Math.max(0, -y);
    pos.setXYZ(i, pos.getX(i) * rx * factor, y * ry, pos.getZ(i) * rz * factor);
  }
  geo.computeVertexNormals();
  return geo;
}
