import * as THREE from 'three';

import { soldarCostura } from './geometria';

/**
 * Acabado de tela: lo que hace que una prenda se vea PUESTA y no pintada
 * sobre la piel.
 *
 * - Pliegues: la tela cae en ondas que crecen hacia el borde libre (bajo de la
 *   camiseta, puño, bajo del pantalón) y se arruga un poco en codos y rodillas.
 *   Los valles quedan algo más oscuros (oclusión), como en una foto real.
 * - Dobladillo: un borde con grosor en cada abertura; la tela deja de ser una
 *   superficie sin espesor.
 * - Interior: la cara de dentro es más oscura, visible en cuello, puños y bajos.
 */

export interface Pliegue {
  /** Amplitud máxima de los pliegues (m), en el borde libre. */
  amplitud: number;
  /** Número de pliegues alrededor de la prenda. */
  pliegues: number;
  /** Lado libre de la tela: 'v0' (bajo de un loft) o 'v1' (final de un tubo). */
  libre: 'v0' | 'v1';
  /** Arrugas transversales (codos, rodillas, tobillos), en m. */
  arrugas?: number;
  /** Desfase para que dos piezas no tengan pliegues idénticos. */
  semilla?: number;
}

const TAU = Math.PI * 2;

/** Desplaza la superficie a lo largo de su normal y guarda la oclusión en colores de vértice. */
export function plegar(geo: THREE.BufferGeometry, p: Pliegue): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const semilla = p.semilla ?? 0;
  const colores = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    const libre = p.libre === 'v0' ? 1 - v : v;
    // Cerca de la costura de arriba (hombros, cintura) la tela está tensa.
    const caida = 0.18 + 0.82 * libre ** 1.6;
    // Onda en [-1, 1]; la tela solo se separa del cuerpo (nunca se hunde en él):
    // el desplazamiento es 0..amplitud y los valles se marcan con la sombra.
    const onda =
      0.62 * Math.sin(TAU * p.pliegues * u + semilla + 1.4 * libre) + 0.38 * Math.sin(TAU * (2 * p.pliegues + 1) * u + semilla * 1.7 - 2.2 * libre);
    let d = p.amplitud * caida * (0.5 + 0.5 * onda);
    let valle = onda * caida;
    if (p.arrugas) {
      // Ondas que rodean la extremidad, más marcadas en la parte de atrás/dentro.
      const lado = 0.55 + 0.45 * Math.sin(TAU * u + semilla);
      const arruga = Math.sin(TAU * 7 * v + 1.6 * Math.sin(TAU * 2 * u + semilla));
      d += p.arrugas * lado * (0.5 + 0.5 * arruga);
      valle = Math.min(valle, arruga * lado);
    }
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * d, pos.getY(i) + nor.getY(i) * d, pos.getZ(i) + nor.getZ(i) * d);
    const sombra = THREE.MathUtils.clamp(1 - 0.3 * Math.max(0, -valle) - 0.05 * libre, 0.6, 1);
    colores.set([sombra, sombra, sombra], i * 3);
  }
  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  geo.computeVertexNormals();
  const rejilla = geo.userData['rejilla'] as { filas: number; columnas: number } | undefined;
  if (rejilla) soldarCostura(geo, rejilla.filas, rejilla.columnas);
  return geo;
}

/**
 * Dobladillo: tubo cerrado que recorre la fila de borde (0 o la última) de un
 * loft/tubo. Da grosor visible al borde de la tela.
 */
export function dobladillo(geo: THREE.BufferGeometry, borde: 'primera' | 'ultima', grosor: number): THREE.BufferGeometry | null {
  const rejilla = geo.userData['rejilla'] as { filas: number; columnas: number } | undefined;
  if (!rejilla) return null;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const fila = borde === 'primera' ? 0 : rejilla.filas - 1;
  const puntos: THREE.Vector3[] = [];
  // La última columna repite la primera (costura): se omite para cerrar la curva.
  for (let s = 0; s < rejilla.columnas - 1; s += 1) {
    const i = fila * rejilla.columnas + s;
    // Un poco hacia fuera para que el borde envuelva la tela y no se hunda en ella.
    puntos.push(
      new THREE.Vector3(
        pos.getX(i) + nor.getX(i) * grosor * 0.4,
        pos.getY(i) + nor.getY(i) * grosor * 0.4,
        pos.getZ(i) + nor.getZ(i) * grosor * 0.4
      )
    );
  }
  if (puntos.length < 3) return null;
  const curva = new THREE.CatmullRomCurve3(puntos, true, 'centripetal');
  const tuboBorde = new THREE.TubeGeometry(curva, Math.max(48, puntos.length * 2), grosor, 8, true);
  // Tono uniforme (sin oclusión) para que el material con vertexColors funcione igual.
  const colores = new Float32Array(tuboBorde.getAttribute('position').count * 3).fill(0.92);
  tuboBorde.setAttribute('color', new THREE.BufferAttribute(colores, 3));
  return tuboBorde;
}

/** Material de la cara interior de una prenda: el color de la tela, más oscuro y mate. */
export function materialInterior(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.42),
    roughness: 0.95,
    metalness: 0,
    side: THREE.BackSide,
  });
}
