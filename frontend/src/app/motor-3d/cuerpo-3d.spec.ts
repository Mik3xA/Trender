import * as THREE from 'three';

import { MEDIDAS_INICIALES, TIPOS_CUERPO, calcularProporciones } from '../probador/cuerpo';
import { ESTILOS, MUESTRAS, estiloDe } from '../probador/prendas';
import { construirCalzado, construirCuerpo, construirEsqueleto, construirInferior, construirSuperior, construirVestido } from './cuerpo-3d';

const material = new THREE.MeshBasicMaterial();
const mat = { tela: material, detalle: material };

function caja(objeto: THREE.Object3D): THREE.Box3 {
  objeto.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(objeto);
}

function sinNaN(objeto: THREE.Object3D): boolean {
  let ok = true;
  objeto.traverse((o) => {
    const geo = (o as THREE.Mesh).geometry;
    if (geo) ok &&= Array.from(geo.getAttribute('position').array as Float32Array).every(Number.isFinite);
  });
  return ok;
}

describe('cuerpo-3d', () => {
  it('el cuerpo mide lo que indica la altura', () => {
    for (const altura of [150, 176, 200]) {
      const esq = construirEsqueleto(calcularProporciones({ ...MEDIDAS_INICIALES.Masculino, altura }));
      const b = caja(construirCuerpo(esq, material));
      expect(b.max.y).toBeCloseTo(altura / 100, 1);
      expect(b.min.y).toBeGreaterThanOrEqual(-0.001);
    }
  });

  it('los muslos son tan anchos como la cadera (sin escalón)', () => {
    const p = calcularProporciones(MEDIDAS_INICIALES.Femenino);
    const cuerpo = construirCuerpo(construirEsqueleto(p), material);
    const torso = caja(cuerpo.getObjectByName('torso')!);
    const pierna = caja(cuerpo.getObjectByName('pierna_izq')!);
    expect(pierna.max.x).toBeGreaterThan(torso.max.x * 0.95);
  });

  it('construye todas las prendas para todos los tipos de cuerpo sin valores inválidos', () => {
    for (const genero of ['Femenino', 'Masculino'] as const) {
      for (const tipo of TIPOS_CUERPO) {
        const esq = construirEsqueleto(calcularProporciones({ ...MEDIDAS_INICIALES[genero], tipoCuerpo: tipo.id, peso: 95 }));
        for (const nombre of Object.keys(ESTILOS)) {
          const estilo = ESTILOS[nombre];
          const grupo = ['tenis', 'botas', 'sandalias', 'zapatos'].includes(nombre)
            ? construirCalzado(esq, estilo, mat)
            : nombre === 'vestido'
              ? construirVestido(esq, estilo, mat)
              : ['pantalon', 'jeans', 'jogger', 'leggings', 'short', 'falda'].includes(nombre)
                ? construirInferior(esq, estilo, nombre, mat)
                : construirSuperior(esq, estilo, mat);
          expect(grupo.children.length).toBeGreaterThan(0);
          expect(sinNaN(grupo)).toBe(true);
        }
      }
    }
  });

  it('las prendas quedan por fuera del cuerpo', () => {
    const esq = construirEsqueleto(calcularProporciones(MEDIDAS_INICIALES.Masculino));
    const torso = caja(construirCuerpo(esq, material).getObjectByName('torso')!);
    const sudadera = MUESTRAS.find((m) => m.id === 'm-sudadera')!;
    const superior = caja(construirSuperior(esq, estiloDe(sudadera), mat).getObjectByName('superior_cuerpo')!);
    expect(superior.max.x).toBeGreaterThan(torso.max.x);
    expect(superior.max.z).toBeGreaterThan(torso.max.z);
  });
});
