import * as THREE from 'three';

import { Anillo, puntoAnillo } from './geometria';

/**
 * Detalles de confección que van SOBRE la tela (como en una prenda real):
 * cierre, tapeta con botones, bolsillos... Se construyen como parches que
 * siguen la superficie de la prenda, separados unos milímetros de ella.
 */

const EXPONENTE = 2.15; // el mismo de loft()

/** Anillo interpolado linealmente a una altura. */
function anilloA(anillos: Anillo[], y: number): Anillo {
  if (y <= anillos[0].y) return { ...anillos[0], y };
  for (let i = 0; i < anillos.length - 1; i += 1) {
    const [a, b] = [anillos[i], anillos[i + 1]];
    if (y <= b.y) {
      const t = (y - a.y) / (b.y - a.y || 1);
      const m = (k: 'ancho' | 'frente' | 'atras') => a[k] + (b[k] - a[k]) * t;
      return { y, ancho: m('ancho'), frente: m('frente'), atras: m('atras'), x: a.x, z: a.z };
    }
  }
  return { ...anillos[anillos.length - 1], y };
}

/** Punto de la superficie de la prenda (theta = 0 es el frente) desplazado hacia fuera. */
export function puntoSuperficie(anillos: Anillo[], y: number, theta: number, separacion: number): THREE.Vector3 {
  const [x, z] = puntoAnillo(anilloA(anillos, y), theta, EXPONENTE);
  const largo = Math.hypot(x, z) || 1;
  return new THREE.Vector3(x + (x / largo) * separacion, y, z + (z / largo) * separacion);
}

/**
 * Parche curvo sobre la prenda entre dos alturas y dos ángulos.
 * `inclinacion` desplaza el ángulo con la altura (bolsillos en diagonal).
 */
export function parche(
  anillos: Anillo[],
  { y0, y1, th0, th1, separacion, inclinacion = 0, filas = 14, columnas = 8 }: { y0: number; y1: number; th0: number; th1: number; separacion: number; inclinacion?: number; filas?: number; columnas?: number }
): THREE.BufferGeometry {
  const posiciones: number[] = [];
  const indices: number[] = [];
  for (let f = 0; f <= filas; f += 1) {
    const t = f / filas;
    const y = y0 + (y1 - y0) * t;
    for (let c = 0; c <= columnas; c += 1) {
      const theta = th0 + ((th1 - th0) * c) / columnas + inclinacion * t;
      // El borde del parche baja hacia la tela: se ve cosido, no flotando.
      const borde = Math.min(f, filas - f, c, columnas - c) === 0 ? 0.35 : 1;
      const p = puntoSuperficie(anillos, y, theta, separacion * borde);
      posiciones.push(p.x, p.y, p.z);
    }
  }
  const ancho = columnas + 1;
  for (let f = 0; f < filas; f += 1) {
    for (let c = 0; c < columnas; c += 1) {
      const a = f * ancho + c;
      indices.push(a, a + 1, a + ancho, a + 1, a + ancho + 1, a + ancho);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Botones (discos) a lo largo del frente, de abajo hacia arriba. */
export function botones(anillos: Anillo[], y0: number, y1: number, paso: number, radio: number, separacion: number): THREE.BufferGeometry[] {
  const lista: THREE.BufferGeometry[] = [];
  for (let y = y0; y <= y1; y += paso) {
    const geo = new THREE.SphereGeometry(radio, 14, 10);
    geo.scale(1, 1, 0.4);
    const p = puntoSuperficie(anillos, y, 0, separacion);
    geo.translate(p.x, p.y, p.z);
    lista.push(geo);
  }
  return lista;
}

/** Material de adornos (cierre, botones, vivos): contrasta con la tela. */
export function materialAdorno(colorTela: THREE.ColorRepresentation, metalico = false): THREE.MeshStandardMaterial {
  const base = new THREE.Color(colorTela);
  const luz = base.getHSL({ h: 0, s: 0, l: 0 }).l;
  const color = metalico ? new THREE.Color(luz > 0.6 ? '#8d8d8a' : '#c9c9c4') : luz > 0.45 ? base.clone().multiplyScalar(0.55) : base.clone().lerp(new THREE.Color('#ffffff'), 0.16);
  return new THREE.MeshStandardMaterial({ color, roughness: metalico ? 0.35 : 0.7, metalness: metalico ? 0.8 : 0, side: THREE.DoubleSide });
}
