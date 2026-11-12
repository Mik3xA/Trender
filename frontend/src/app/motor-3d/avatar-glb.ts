import * as THREE from 'three';

import { Medidas, estimarContornos } from '../probador/cuerpo';

/**
 * Avatar realista opcional (.glb). Si `environment.avatares[genero]` apunta a
 * un modelo, el motor lo usa en lugar del cuerpo paramétrico.
 *
 * Requisitos del modelo (p. ej. exportado de MakeHuman, CC0, o de Blender):
 * - De pie, en pose A, mirando a +Z, pies en y = 0, en metros.
 * - Morph targets (shape keys) opcionales con estos nombres, de 0 a 1:
 *   `pecho`, `cintura`, `cadera`, `peso`, `musculo`.
 * - Huesos opcionales `hombro_izq`/`hombro_der` (o mixamorig:LeftShoulder…)
 *   para ensanchar hombros.
 * La altura se ajusta escalando el modelo completo a la altura indicada.
 */

/** Rango (cm) que representa cada morph de 0 a 1 respecto al modelo base. */
const RANGOS: Record<'pecho' | 'cintura' | 'cadera', [number, number]> = {
  pecho: [80, 130],
  cintura: [60, 120],
  cadera: [85, 135],
};
const HUESOS_HOMBRO = /^(hombro_(izq|der)|mixamorig:?(Left|Right)Shoulder)$/i;

const normalizar = (v: number, [min, max]: [number, number]) => Math.min(1, Math.max(0, (v - min) / (max - min)));

/** Valores 0..1 de cada morph target para unas medidas. */
export function influenciasPara(medidas: Medidas): Record<string, number> {
  const c = estimarContornos(medidas);
  const imc = medidas.peso / (medidas.altura / 100) ** 2;
  return {
    pecho: normalizar(c.pecho, RANGOS.pecho),
    cintura: normalizar(c.cintura, RANGOS.cintura),
    cadera: normalizar(c.cadera, RANGOS.cadera),
    peso: Math.min(1, Math.max(0, (imc - 18) / 17)),
    musculo: medidas.tipoCuerpo === 'fit' ? 0.8 : medidas.tipoCuerpo === 'delgado' ? 0.1 : 0.35,
  };
}

/**
 * Deforma un avatar GLB según las medidas: morph targets, huesos de hombro
 * y escala uniforme a la altura. Devuelve los nombres de morph aplicados.
 */
export function aplicarMedidasAGlb(raiz: THREE.Object3D, medidas: Medidas, alturaBase: number): string[] {
  const influencias = influenciasPara(medidas);
  const aplicados = new Set<string>();
  raiz.traverse((o) => {
    const malla = o as THREE.Mesh;
    if (malla.morphTargetDictionary && malla.morphTargetInfluences) {
      for (const [nombre, valor] of Object.entries(influencias)) {
        const i = malla.morphTargetDictionary[nombre];
        if (i !== undefined) {
          malla.morphTargetInfluences[i] = valor;
          aplicados.add(nombre);
        }
      }
    }
    const hueso = o as THREE.Bone;
    if (hueso.isBone && HUESOS_HOMBRO.test(hueso.name)) {
      hueso.scale.setScalar(medidas.tipoCuerpo === 'fit' ? 1.08 : medidas.tipoCuerpo === 'delgado' ? 0.96 : 1);
    }
  });
  raiz.scale.setScalar(medidas.altura / 100 / alturaBase);
  return [...aplicados];
}

/** Altura del modelo tal como viene en el archivo (para escalarlo después). */
export function alturaDe(raiz: THREE.Object3D): number {
  const caja = new THREE.Box3().setFromObject(raiz);
  return Math.max(0.1, caja.max.y - caja.min.y);
}
