import * as THREE from 'three';

/** Tonos del avatar. "maniqui" es porcelana de estudio; el resto, piel. */
export const TONOS = [
  { id: 'maniqui', nombre: 'Maniquí', color: '#bdb8ae' },
  { id: 'claro', nombre: 'Claro', color: '#e9c6aa' },
  { id: 'medio', nombre: 'Medio', color: '#c99a76' },
  { id: 'moreno', nombre: 'Moreno', color: '#9c6b4a' },
  { id: 'oscuro', nombre: 'Oscuro', color: '#5e3b27' },
] as const;

let mapaPoros: THREE.Texture | null | undefined;

/** Mapa de normales procedimental muy sutil (poros) para que la piel no parezca plástico. */
function normalesPiel(): THREE.Texture | null {
  if (mapaPoros !== undefined) return mapaPoros;
  mapaPoros = null;
  if (typeof document === 'undefined') return null;
  const lado = 256;
  const canvas = document.createElement('canvas');
  canvas.width = lado;
  canvas.height = lado;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return null;
  // Altura aleatoria suavizada -> normales por diferencias finitas.
  const altura = new Float32Array(lado * lado).map(() => Math.random());
  const imagen = ctx.createImageData(lado, lado);
  for (let y = 0; y < lado; y += 1) {
    for (let x = 0; x < lado; x += 1) {
      const h = (dx: number, dy: number) => altura[((y + dy + lado) % lado) * lado + ((x + dx + lado) % lado)];
      const nx = (h(-1, 0) - h(1, 0)) * 0.5;
      const ny = (h(0, -1) - h(0, 1)) * 0.5;
      const i = (y * lado + x) * 4;
      imagen.data[i] = 128 + nx * 60;
      imagen.data[i + 1] = 128 + ny * 60;
      imagen.data[i + 2] = 255;
      imagen.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imagen, 0, 0);
  mapaPoros = new THREE.CanvasTexture(canvas);
  mapaPoros.wrapS = THREE.RepeatWrapping;
  mapaPoros.wrapT = THREE.RepeatWrapping;
  mapaPoros.repeat.set(24, 24);
  return mapaPoros;
}

/** Ajusta el material del cuerpo (PBR) al tono elegido. */
export function aplicarTono(material: THREE.MeshPhysicalMaterial, tono: string): void {
  const info = TONOS.find((t) => t.id === tono) ?? TONOS[0];
  material.color.set(info.color);
  if (info.id === 'maniqui') {
    material.roughness = 0.78; // mate: la ropa (con brillo de tela) resalta sobre el maniquí
    material.clearcoat = 0.25;
    material.sheen = 0.25;
    material.normalMap = null;
  } else {
    // Piel: brillo aterciopelado (sheen) cálido, poca capa de barniz y poros.
    material.roughness = 0.5;
    material.clearcoat = 0.06;
    material.clearcoatRoughness = 0.7;
    material.sheen = 0.45;
    material.sheenRoughness = 0.6;
    material.sheenColor.set('#ffd9c4');
    material.normalMap = normalesPiel();
    material.normalScale.set(0.15, 0.15);
  }
  material.needsUpdate = true;
}
