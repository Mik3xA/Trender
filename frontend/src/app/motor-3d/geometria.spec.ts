import * as THREE from 'three';

import { loft, suavizarAnillos, tubo } from './geometria';

/** Fracción de caras cuya normal apunta hacia fuera del eje/centro dado. */
function haciaFuera(geo: THREE.BufferGeometry, centro: (p: THREE.Vector3) => THREE.Vector3): number {
  const pos = geo.getAttribute('position');
  const indices = geo.getIndex()!;
  let fuera = 0;
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const caras = indices.count / 3;
  for (let i = 0; i < indices.count; i += 3) {
    a.fromBufferAttribute(pos, indices.getX(i));
    b.fromBufferAttribute(pos, indices.getX(i + 1));
    c.fromBufferAttribute(pos, indices.getX(i + 2));
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const medio = a.clone().add(b).add(c).divideScalar(3);
    if (normal.dot(medio.clone().sub(centro(medio))) > 0) fuera += 1;
  }
  return fuera / caras;
}

describe('geometria', () => {
  const anillos = [
    { y: 0, ancho: 0.1, frente: 0.08, atras: 0.09 },
    { y: 0.2, ancho: 0.15, frente: 0.1, atras: 0.12, relieve: { amplitud: 0.3, angulo: 0.5, apertura: 0.1 } },
    { y: 0.4, ancho: 0.05, frente: 0.05, atras: 0.05 },
  ];

  it('loft: todas las caras (incluidas las tapas) apuntan hacia fuera', () => {
    const geo = loft(anillos, { tapaInferior: true, tapaSuperior: true });
    // Centro del volumen: así también se juzgan las tapas (horizontales).
    expect(haciaFuera(geo, (p) => new THREE.Vector3(0, Math.min(Math.max(p.y, 0.05), 0.35), 0))).toBeGreaterThan(0.97);
  });

  it('tubo: caras hacia fuera alrededor de su eje', () => {
    const geo = tubo(
      [
        { punto: new THREE.Vector3(0, 1, 0), radio: 0.05 },
        { punto: new THREE.Vector3(0.02, 0.5, 0.01), radio: 0.04 },
        { punto: new THREE.Vector3(0.03, 0, 0), radio: 0.02 },
      ],
      { tapas: true }
    );
    expect(haciaFuera(geo, (p) => new THREE.Vector3(0.015 * (1 - p.y) * 2, p.y, 0.005))).toBeGreaterThan(0.95);
  });

  it('el suavizado no produce anchos negativos ni pierde los extremos', () => {
    const suaves = suavizarAnillos(anillos, 6);
    expect(suaves).toHaveLength(13);
    expect(suaves[0].y).toBe(0);
    expect(suaves.at(-1)!.y).toBe(0.4);
    expect(suaves.every((a) => a.ancho > 0 && a.frente > 0 && a.atras > 0)).toBe(true);
  });
});
