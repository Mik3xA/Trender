import * as THREE from 'three';

import { Tela } from '../probador/prendas';

/** Aspecto de cada tela: rugosidad, brillo y patrón procedimental. */
const PROPIEDADES: Record<Tela, { rugosidad: number; brillo: number; repetir: [number, number] }> = {
  punto: { rugosidad: 0.88, brillo: 0.35, repetir: [10, 10] },
  tejido: { rugosidad: 0.8, brillo: 0.2, repetir: [14, 14] },
  mezclilla: { rugosidad: 0.86, brillo: 0.15, repetir: [12, 12] },
  felpa: { rugosidad: 0.95, brillo: 0.5, repetir: [6, 6] },
  lana: { rugosidad: 0.97, brillo: 0.55, repetir: [8, 8] },
  piel: { rugosidad: 0.42, brillo: 0, repetir: [3, 3] },
  lona: { rugosidad: 0.9, brillo: 0.1, repetir: [10, 10] },
  satin: { rugosidad: 0.38, brillo: 0.6, repetir: [2, 2] },
};

const cache = new Map<Tela, THREE.Texture | null>();

function lienzo(tam = 128): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = tam;
  canvas.height = tam;
  try {
    return canvas.getContext('2d');
  } catch {
    return null; // entornos sin canvas (pruebas con jsdom)
  }
}

/** Patrón en escala de grises (claro = sin cambio de color) que se multiplica por el color de la prenda. */
function dibujar(ctx: CanvasRenderingContext2D, tela: Tela): void {
  const t = ctx.canvas.width;
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, t, t);
  const linea = (color: string, ancho: number, x1: number, y1: number, x2: number, y2: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = ancho;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  switch (tela) {
    case 'punto':
      for (let x = 0; x < t; x += 4) linea(x % 8 ? '#e2e2e2' : '#ffffff', 2, x, 0, x, t);
      break;
    case 'tejido':
      for (let i = 0; i < t; i += 3) {
        linea('#e6e6e6', 1, 0, i, t, i);
        linea('#ececec', 1, i, 0, i, t);
      }
      break;
    case 'mezclilla':
      // Sarga diagonal con desgaste.
      for (let i = -t; i < t * 2; i += 4) linea('#d0d4dc', 1.6, i, 0, i + t, t);
      for (let n = 0; n < 220; n += 1) {
        ctx.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.25})`;
        ctx.fillRect(Math.random() * t, Math.random() * t, 1 + Math.random() * 3, 1);
      }
      break;
    case 'felpa':
    case 'lana':
      for (let n = 0; n < 1600; n += 1) {
        const g = 215 + Math.floor(Math.random() * 40);
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.fillRect(Math.random() * t, Math.random() * t, 2, 2);
      }
      if (tela === 'lana') for (let x = 0; x < t; x += 8) linea('#dcdcdc', 3, x, 0, x, t);
      break;
    case 'piel':
      for (let n = 0; n < 260; n += 1) {
        ctx.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`;
        ctx.beginPath();
        ctx.arc(Math.random() * t, Math.random() * t, 1 + Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'lona':
      for (let i = 0; i < t; i += 2) linea(i % 4 ? '#e8e8e8' : '#f8f8f8', 1, 0, i, t, i);
      break;
    case 'satin': {
      const brillo = ctx.createLinearGradient(0, 0, t, t);
      brillo.addColorStop(0, '#f0f0f0');
      brillo.addColorStop(0.5, '#ffffff');
      brillo.addColorStop(1, '#ebebeb');
      ctx.fillStyle = brillo;
      ctx.fillRect(0, 0, t, t);
      break;
    }
  }
}

export function texturaTela(tela: Tela): THREE.Texture | null {
  if (cache.has(tela)) return cache.get(tela)!;
  const ctx = lienzo();
  let textura: THREE.Texture | null = null;
  if (ctx) {
    dibujar(ctx, tela);
    textura = new THREE.CanvasTexture(ctx.canvas);
    textura.wrapS = THREE.RepeatWrapping;
    textura.wrapT = THREE.RepeatWrapping;
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.anisotropy = 4;
    textura.repeat.set(...PROPIEDADES[tela].repetir);
  }
  cache.set(tela, textura);
  return textura;
}

/** Material de una prenda: color real + textura de su tela. */
export function materialTela(color: string, tela: Tela): THREE.MeshPhysicalMaterial {
  const props = PROPIEDADES[tela];
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    map: texturaTela(tela),
    roughness: props.rugosidad,
    metalness: 0,
    sheen: props.brillo,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color('#ffffff'),
    clearcoat: tela === 'piel' ? 0.35 : 0,
    clearcoatRoughness: 0.5,
    side: THREE.DoubleSide,
  });
}

/** Libera las texturas compartidas (al destruir el visor). */
export function liberarTexturas(): void {
  for (const textura of cache.values()) textura?.dispose();
  cache.clear();
}

// ------------------------------------------------------------------ foto real de la prenda

const LADO_TEXTURA = 1024;
const fotos = new Map<string, Promise<HTMLImageElement | null>>();

function cargarFoto(url: string): Promise<HTMLImageElement | null> {
  if (!fotos.has(url)) {
    fotos.set(
      url,
      new THREE.ImageLoader()
        .setCrossOrigin('anonymous')
        .loadAsync(url)
        .catch(() => null) // sin CORS o 404: la prenda se queda con su color
    );
  }
  return fotos.get(url)!;
}

/**
 * Material con la foto recortada de la prenda. La foto se dibuja "contain"
 * sobre el color dominante en un lienzo cuadrado: donde la malla 3D se sale
 * de la silueta de la foto se ve el color de la tela, no un hueco.
 * El material se devuelve al instante con el color y la foto se aplica al cargar.
 */
export function materialConFoto(url: string, colorBase: string, tela: Tela): THREE.MeshPhysicalMaterial {
  const material = materialTela(colorBase, tela);
  material.map = null;
  cargarFoto(url).then((foto) => {
    const ctx = lienzo(LADO_TEXTURA);
    if (!foto || !ctx) return;
    ctx.fillStyle = colorBase;
    ctx.fillRect(0, 0, LADO_TEXTURA, LADO_TEXTURA);
    const escala = Math.min(LADO_TEXTURA / foto.width, LADO_TEXTURA / foto.height);
    const [w, h] = [foto.width * escala, foto.height * escala];
    ctx.drawImage(foto, (LADO_TEXTURA - w) / 2, (LADO_TEXTURA - h) / 2, w, h);
    const textura = new THREE.CanvasTexture(ctx.canvas);
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.anisotropy = 8;
    material.map = textura;
    material.color.set('#ffffff'); // el color ya viene en la foto
    material.needsUpdate = true;
  });
  return material;
}

/**
 * Proyección planar de la foto sobre la prenda 3D (como un proyector):
 * - 'frente': la foto de catálogo (vista frontal) cubre la prenda en X/Y,
 *   mangas y perneras incluidas, centrada y sin deformar (misma escala en
 *   ambos ejes, igual que el "contain" del lienzo).
 * - 'lado': para calzado, cuya foto de tienda suele ser de perfil (Z/Y).
 * Reescribe el atributo `uv` de cada malla con material de tela.
 */
export function proyectarFoto(grupo: THREE.Object3D, modo: 'frente' | 'lado', esTela: (m: THREE.Mesh) => boolean): void {
  grupo.updateMatrixWorld(true);
  const mallas: THREE.Mesh[] = [];
  grupo.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && esTela(m)) mallas.push(m);
  });
  if (!mallas.length) return;

  const caja = new THREE.Box3();
  for (const m of mallas) caja.expandByObject(m);
  const centro = caja.getCenter(new THREE.Vector3());
  const tam = caja.getSize(new THREE.Vector3());
  const ancho = modo === 'frente' ? tam.x : tam.z;
  const escala = Math.max(ancho, tam.y) * 1.02;
  const v = new THREE.Vector3();

  for (const malla of mallas) {
    const pos = malla.geometry.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(malla.matrixWorld).applyMatrix4(grupo.matrixWorld.clone().invert());
      const horizontal = modo === 'frente' ? v.x - centro.x : centro.z - v.z;
      uv[i * 2] = 0.5 + horizontal / escala;
      uv[i * 2 + 1] = 0.5 + (v.y - centro.y) / escala;
    }
    malla.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
}

/** Libera las fotos cargadas (al destruir el visor). */
export function liberarFotos(): void {
  fotos.clear();
}
