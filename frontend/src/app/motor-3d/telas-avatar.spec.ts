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
    proyectarFoto(grupo, { categoria: 'Piernas' }, () => true);
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
    const grupo = new THREE.Group().add(new THREE.Group().add(zapato, suela));
    const uvSuela = suela.geometry.getAttribute('uv');
    proyectarFoto(grupo, { categoria: 'Calzado' }, (m) => m.material === tela);
    expect(suela.geometry.getAttribute('uv')).toBe(uvSuela);
    expect(zapato.geometry.getAttribute('aLado')).toBeDefined();
  });

  it('con zonas, estira la prenda a la zona de la foto y funde los costados con el color de la tela', () => {
    const grupo = new THREE.Group();
    const pantalon = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 0.2), new THREE.MeshBasicMaterial());
    grupo.add(pantalon);
    proyectarFoto(grupo, { categoria: 'Piernas', zonas: { prenda: { x0: 0.2, y0: 0.1, x1: 0.8, y1: 0.9 } } }, () => true);
    const uv = pantalon.geometry.getAttribute('uv');
    const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
    const vs = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
    expect(Math.min(...us)).toBeCloseTo(0.2, 5);
    expect(Math.max(...us)).toBeCloseTo(0.8, 5);
    expect(Math.min(...vs)).toBeCloseTo(0.1, 5); // v = 1 - y de la foto
    expect(Math.max(...vs)).toBeCloseTo(0.9, 5);
    // Caras laterales (normal en X) -> color de la tela; frontales -> foto.
    const lado = pantalon.geometry.getAttribute('aLado');
    const normal = pantalon.geometry.getAttribute('normal');
    for (let i = 0; i < lado.count; i += 1) {
      if (Math.abs(normal.getX(i)) > 0.9) expect(lado.getX(i)).toBe(1);
      if (Math.abs(normal.getZ(i)) > 0.9) expect(lado.getX(i)).toBe(0);
    }
  });

  it('cada manga toma su zona de la foto (la izquierda del avatar, la derecha de la foto)', () => {
    const grupo = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.2), new THREE.MeshBasicMaterial());
    torso.name = 'superior_cuerpo';
    const manga = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5), new THREE.MeshBasicMaterial());
    manga.name = 'manga_izq';
    grupo.add(torso, manga);
    const zonas = {
      prenda: { x0: 0, y0: 0, x1: 1, y1: 1 },
      torso: { x0: 0.25, y0: 0, x1: 0.75, y1: 1 },
      mangaIzquierda: { x0: 0, y0: 0, x1: 0.25, y1: 0.4 },
      mangaDerecha: { x0: 0.75, y0: 0, x1: 1, y1: 0.4 },
    };
    proyectarFoto(grupo, { categoria: 'Torso', zonas }, () => true);
    const uvManga = manga.geometry.getAttribute('uv');
    const us = Array.from({ length: uvManga.count }, (_, i) => uvManga.getX(i));
    expect(Math.min(...us)).toBeGreaterThanOrEqual(0.75 - 1e-6);
    const uvTorso = torso.geometry.getAttribute('uv');
    const ut = Array.from({ length: uvTorso.count }, (_, i) => uvTorso.getX(i));
    expect(Math.min(...ut)).toBeCloseTo(0.25, 5);
    expect(Math.max(...ut)).toBeCloseTo(0.75, 5);
  });
});

describe('acabado de tela', () => {
  it('los pliegues crecen hacia el borde libre y oscurecen los valles', async () => {
    const { loft } = await import('./geometria');
    const { plegar, dobladillo } = await import('./acabado');
    const anillos = [0, 0.5].map((y) => ({ y, ancho: 0.2, frente: 0.15, atras: 0.15 }));
    const geo = loft(anillos, { segmentos: 64 });
    const antes = geo.getAttribute('position').clone();
    plegar(geo, { amplitud: 0.01, pliegues: 6, libre: 'v0' });
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    let abajo = 0;
    let arriba = 0;
    for (let i = 0; i < pos.count; i += 1) {
      const d = Math.hypot(pos.getX(i) - antes.getX(i), pos.getZ(i) - antes.getZ(i));
      if (uv.getY(i) === 0) abajo = Math.max(abajo, d);
      if (uv.getY(i) === 1) arriba = Math.max(arriba, d);
    }
    expect(abajo).toBeGreaterThan(arriba * 3);
    const colores = geo.getAttribute('color');
    expect(Math.min(...Array.from({ length: colores.count }, (_, i) => colores.getX(i)))).toBeLessThan(0.9);
    // El dobladillo es un tubo cerrado con grosor alrededor del bajo.
    const borde = dobladillo(geo, 'primera', 0.004)!;
    borde.computeBoundingBox();
    expect(borde.boundingBox!.max.y - borde.boundingBox!.min.y).toBeGreaterThan(0.006);
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
