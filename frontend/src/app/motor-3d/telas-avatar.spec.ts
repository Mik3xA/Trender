import * as THREE from 'three';

import { MEDIDAS_INICIALES } from '../probador/cuerpo';
import { aplicarMedidasAGlb, influenciasPara } from './avatar-glb';
import { proyectarFoto } from './telas';

describe('proyectarFoto', () => {
  it('proyecta la foto de frente cubriendo la prenda sin deformarla', () => {
    const material = new THREE.MeshBasicMaterial();
    const grupo = new THREE.Group();
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.2), material);
    cuerpo.position.y = 1.2;
    grupo.add(cuerpo);
    proyectarFoto(grupo, 'frente', () => true);
    const uv = cuerpo.geometry.getAttribute('uv');
    const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
    const vs = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
    // Alto (0.6) manda: v ocupa ~[0,1] y u se centra en 0.5 con la misma escala.
    expect(Math.min(...vs)).toBeCloseTo(0.01, 1);
    expect(Math.max(...vs)).toBeCloseTo(0.99, 1);
    expect((Math.min(...us) + Math.max(...us)) / 2).toBeCloseTo(0.5, 5);
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(0.4 / 0.612, 2);
  });

  it('solo toca las mallas de tela (no las suelas)', () => {
    const tela = new THREE.MeshBasicMaterial();
    const suela = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.1), new THREE.MeshBasicMaterial());
    const zapato = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), tela);
    const grupo = new THREE.Group().add(zapato, suela);
    const uvSuela = suela.geometry.getAttribute('uv');
    proyectarFoto(grupo, 'lado', (m) => m.material === tela);
    expect(suela.geometry.getAttribute('uv')).toBe(uvSuela);
  });
});

describe('avatar GLB (morph targets)', () => {
  function avatarDePrueba(): THREE.Group {
    const geo = new THREE.BoxGeometry(0.4, 1.7, 0.2);
    geo.translate(0, 0.85, 0);
    geo.morphAttributes['position'] = ['pecho', 'cintura', 'cadera', 'peso'].map(() => geo.getAttribute('position').clone());
    const malla = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    malla.updateMorphTargets();
    malla.morphTargetDictionary = { pecho: 0, cintura: 1, cadera: 2, peso: 3 };
    const hombro = new THREE.Bone();
    hombro.name = 'mixamorig:LeftShoulder';
    const raiz = new THREE.Group();
    raiz.add(malla, hombro);
    return raiz;
  }

  it('ajusta morph targets, hombros y altura según las medidas', () => {
    const raiz = avatarDePrueba();
    const aplicados = aplicarMedidasAGlb(raiz, { ...MEDIDAS_INICIALES.Masculino, altura: 187, tipoCuerpo: 'fit' }, 1.7);
    expect(aplicados.sort()).toEqual(['cadera', 'cintura', 'pecho', 'peso']);
    const malla = raiz.children[0] as THREE.Mesh;
    expect(malla.morphTargetInfluences!.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(raiz.scale.y).toBeCloseTo(1.87 / 1.7, 5);
    expect((raiz.children[1] as THREE.Bone).scale.x).toBeCloseTo(1.08);
  });

  it('más peso o sobrepeso aumentan las influencias de cintura y peso', () => {
    const base = influenciasPara(MEDIDAS_INICIALES.Masculino);
    const pesado = influenciasPara({ ...MEDIDAS_INICIALES.Masculino, peso: 105, tipoCuerpo: 'sobrepeso' });
    expect(pesado['cintura']).toBeGreaterThan(base['cintura']);
    expect(pesado['peso']).toBeGreaterThan(base['peso']);
  });
});
