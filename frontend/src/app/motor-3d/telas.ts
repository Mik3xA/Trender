import * as THREE from 'three';

import { PrendaVirtual, Tela } from '../probador/prendas';

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
const cacheRelieve = new Map<Tela, THREE.Texture | null>();

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

/**
 * Relieve del tejido (mapa de normales) calculado del mismo patrón: con la luz
 * rasante se ve la trama, que es lo que distingue la tela de la piel.
 */
export function relieveTela(tela: Tela): THREE.Texture | null {
  if (cacheRelieve.has(tela)) return cacheRelieve.get(tela)!;
  const ctx = lienzo();
  let textura: THREE.Texture | null = null;
  if (ctx) {
    dibujar(ctx, tela);
    const t = ctx.canvas.width;
    const alto = ctx.getImageData(0, 0, t, t).data;
    const salida = ctx.createImageData(t, t);
    const h = (x: number, y: number) => alto[(((y + t) % t) * t + ((x + t) % t)) * 4] / 255;
    for (let y = 0; y < t; y += 1) {
      for (let x = 0; x < t; x += 1) {
        const dx = (h(x + 1, y) - h(x - 1, y)) * 2.5;
        const dy = (h(x, y + 1) - h(x, y - 1)) * 2.5;
        const n = new THREE.Vector3(-dx, dy, 1).normalize();
        const i = (y * t + x) * 4;
        salida.data[i] = (n.x * 0.5 + 0.5) * 255;
        salida.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
        salida.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
        salida.data[i + 3] = 255;
      }
    }
    ctx.putImageData(salida, 0, 0);
    textura = new THREE.CanvasTexture(ctx.canvas);
    textura.wrapS = THREE.RepeatWrapping;
    textura.wrapT = THREE.RepeatWrapping;
    textura.anisotropy = 4;
    const [rx, ry] = PROPIEDADES[tela].repetir;
    textura.repeat.set(rx * 1.6, ry * 1.6);
  }
  cacheRelieve.set(tela, textura);
  return textura;
}

/** Material de una prenda: color real + textura y relieve de su tela. */
export function materialTela(color: string, tela: Tela): THREE.MeshPhysicalMaterial {
  const props = PROPIEDADES[tela];
  const relieve = relieveTela(tela);
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    map: texturaTela(tela),
    normalMap: relieve,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: props.rugosidad,
    metalness: 0,
    sheen: props.brillo,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color('#ffffff'),
    clearcoat: tela === 'piel' ? 0.35 : 0,
    clearcoatRoughness: 0.5,
    // Pliegues y oclusión vienen en los colores de vértice (acabado.ts).
    vertexColors: true,
    // La cara de dentro la dibuja otra malla, más oscura (materialInterior).
    side: THREE.FrontSide,
  });
}

/** Libera las texturas compartidas (al destruir el visor). */
export function liberarTexturas(): void {
  for (const textura of cache.values()) textura?.dispose();
  for (const textura of cacheRelieve.values()) textura?.dispose();
  cache.clear();
  cacheRelieve.clear();
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
 * Material con la foto recortada de la prenda.
 * - `estirar` (hay zonas del análisis): la foto ocupa todo el lienzo y las UV
 *   son coordenadas de la foto (0..1), para mapear torso y mangas por separado.
 * - sin zonas: la foto se dibuja "contain" sobre el color dominante.
 * En los costados (donde la proyección frontal estiraría la foto) el color se
 * funde con el color de la tela según el atributo `aLado` de cada vértice.
 * El material se devuelve al instante con el color y la foto se aplica al cargar.
 */
export function materialConFoto(url: string, colorBase: string, tela: Tela, estirar = false): THREE.MeshPhysicalMaterial {
  const material = materialTela(colorBase, tela);
  material.map = null;
  const colorTela = { value: new THREE.Color(colorBase) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uColorTela'] = colorTela;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLado;\nvarying float vLado;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLado = aLado;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uColorTela;\nvarying float vLado;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uColorTela, clamp(vLado, 0.0, 1.0));');
  };
  material.customProgramCacheKey = () => 'tela-con-foto';
  cargarFoto(url).then((foto) => {
    const ctx = lienzo(LADO_TEXTURA);
    if (!foto || !ctx) return;
    ctx.clearRect(0, 0, LADO_TEXTURA, LADO_TEXTURA);
    if (estirar) {
      ctx.drawImage(foto, 0, 0, LADO_TEXTURA, LADO_TEXTURA);
    } else {
      const escala = Math.min(LADO_TEXTURA / foto.width, LADO_TEXTURA / foto.height);
      const [w, h] = [foto.width * escala, foto.height * escala];
      ctx.drawImage(foto, (LADO_TEXTURA - w) / 2, (LADO_TEXTURA - h) / 2, w, h);
    }
    // Lo transparente (fuera de la prenda) y el borde del recorte (2-3 px que
    // pueden conservar restos del fondo) se rellenan con el color MEDIO real de
    // la prenda en la foto: un pliegue que se sale de la silueta no deja huecos
    // ni manchas claras en los costados.
    const datos = ctx.getImageData(0, 0, LADO_TEXTURA, LADO_TEXTURA);
    const n = LADO_TEXTURA * LADO_TEXTURA;
    const opaco = new Uint8Array(n);
    const suma = [0, 0, 0];
    let cuenta = 0;
    for (let k = 0; k < n; k += 1) {
      if (datos.data[k * 4 + 3] >= 250) {
        opaco[k] = 1;
        suma[0] += datos.data[k * 4];
        suma[1] += datos.data[k * 4 + 1];
        suma[2] += datos.data[k * 4 + 2];
        cuenta += 1;
      }
    }
    const base = new THREE.Color(colorBase);
    const medio = cuenta ? suma.map((v) => v / cuenta) : [base.r * 255, base.g * 255, base.b * 255];
    // Erosión del área opaca (radio 3, separable): el borde pasa al color medio.
    const radio = 3;
    const horizontal = new Uint8Array(n);
    for (let y = 0; y < LADO_TEXTURA; y += 1) {
      for (let x = 0; x < LADO_TEXTURA; x += 1) {
        let v = 1;
        for (let d = -radio; d <= radio && v; d += 1) v = opaco[y * LADO_TEXTURA + Math.min(LADO_TEXTURA - 1, Math.max(0, x + d))];
        horizontal[y * LADO_TEXTURA + x] = v;
      }
    }
    for (let y = 0; y < LADO_TEXTURA; y += 1) {
      for (let x = 0; x < LADO_TEXTURA; x += 1) {
        let v = 1;
        for (let d = -radio; d <= radio && v; d += 1) v = horizontal[Math.min(LADO_TEXTURA - 1, Math.max(0, y + d)) * LADO_TEXTURA + x];
        if (!v) {
          const i = (y * LADO_TEXTURA + x) * 4;
          datos.data[i] = medio[0];
          datos.data[i + 1] = medio[1];
          datos.data[i + 2] = medio[2];
          datos.data[i + 3] = 255;
        }
      }
    }
    // El costado de la prenda (aLado) se funde con este mismo color medio.
    colorTela.value.setRGB(medio[0] / 255, medio[1] / 255, medio[2] / 255, THREE.SRGBColorSpace);
    ctx.putImageData(datos, 0, 0);
    const textura = new THREE.CanvasTexture(ctx.canvas);
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.anisotropy = 8;
    material.map = textura;
    material.color.set('#ffffff'); // el color ya viene en la foto
    // Con la foto, el brillo de la tela toma su color: un brillo blanco la deslavaría.
    material.sheen *= 0.45;
    material.sheenColor.set(colorBase).lerp(new THREE.Color('#ffffff'), 0.35);
    material.needsUpdate = true;
  });
  return material;
}

type ZonaFoto = { x0: number; y0: number; x1: number; y1: number };

function mallasDe(grupo: THREE.Object3D, filtro: (m: THREE.Mesh) => boolean): THREE.Mesh[] {
  const mallas: THREE.Mesh[] = [];
  grupo.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && filtro(m)) mallas.push(m);
  });
  return mallas;
}

const suave = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Proyección planar de la foto (como un proyector) sobre un conjunto de mallas.
 * - 'frente': X/Y (foto frontal de catálogo); 'lado': Z/Y (calzado de perfil).
 * - Con `zona`, la caja de las mallas se estira a esa zona de la foto (UV =
 *   coordenadas de la foto); sin zona, "contain" centrado (lienzo contain).
 * - Escribe `aLado` (0 = foto, 1 = color de la tela) según hacia dónde mira cada vértice.
 */
function proyectarPlanar(
  grupo: THREE.Object3D,
  mallas: THREE.Mesh[],
  modo: 'frente' | 'lado',
  zona: ZonaFoto | null,
  opciones: { espaldaConFoto?: boolean; puntaDerecha?: boolean } = {}
): void {
  if (!mallas.length) return;
  grupo.updateMatrixWorld(true);
  const aLocal = grupo.matrixWorld.clone().invert();
  const caja = new THREE.Box3();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const matriz = new THREE.Matrix4();
  for (const m of mallas) {
    matriz.multiplyMatrices(aLocal, m.matrixWorld);
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) caja.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(matriz));
  }
  const centro = caja.getCenter(new THREE.Vector3());
  const tam = caja.getSize(new THREE.Vector3());
  const ancho = Math.max(1e-6, modo === 'frente' ? tam.x : tam.z);
  const alto = Math.max(1e-6, tam.y);
  const escala = Math.max(ancho, alto) * 1.02;
  const espalda = opciones.espaldaConFoto ?? true;

  for (const malla of mallas) {
    matriz.multiplyMatrices(aLocal, malla.matrixWorld);
    const normalMatriz = new THREE.Matrix3().getNormalMatrix(matriz);
    const pos = malla.geometry.getAttribute('position');
    const nor = malla.geometry.getAttribute('normal');
    const uv = new Float32Array(pos.count * 2);
    const lado = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matriz);
      let horizontal = modo === 'frente' ? v.x - centro.x : centro.z - v.z;
      if (modo === 'lado' && opciones.puntaDerecha) horizontal = -horizontal;
      if (zona) {
        const fx = 0.5 + horizontal / ancho;
        const fy = 0.5 - (v.y - centro.y) / alto; // 0 arriba, 1 abajo (como en la foto)
        uv[i * 2] = zona.x0 + THREE.MathUtils.clamp(fx, 0, 1) * (zona.x1 - zona.x0);
        uv[i * 2 + 1] = 1 - (zona.y0 + THREE.MathUtils.clamp(fy, 0, 1) * (zona.y1 - zona.y0));
      } else {
        uv[i * 2] = 0.5 + horizontal / escala;
        uv[i * 2 + 1] = 0.5 + (v.y - centro.y) / escala;
      }
      // Cuánto mira hacia la cámara del "proyector": de lado, la foto se estiraría.
      if (nor) {
        n.fromBufferAttribute(nor, i).applyMatrix3(normalMatriz).normalize();
        const frente = modo === 'frente' ? n.z : Math.abs(n.x);
        const mira = espalda || frente > 0 ? Math.abs(frente) : 0;
        lado[i] = 1 - suave(0.18, 0.55, mira);
      }
    }
    malla.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    malla.geometry.setAttribute('aLado', new THREE.BufferAttribute(lado, 1));
  }
}

/**
 * Manga: la foto plana tiene la manga extendida hacia el costado y en el
 * avatar cuelga a lo largo del brazo. Se usa la parametrización del tubo
 * (v = del hombro al puño, u = alrededor) para recorrer la zona de la manga
 * de la foto desde el torso hacia fuera.
 */
function proyectarManga(malla: THREE.Mesh, zona: ZonaFoto, haciaIzquierda: boolean): void {
  const uvTubo = malla.geometry.getAttribute('uv');
  const pos = malla.geometry.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    const largo = uvTubo.getY(i); // 0 hombro, 1 puño
    const vuelta = uvTubo.getX(i);
    const fx = haciaIzquierda ? 1 - largo : largo;
    const fy = 0.5 - 0.5 * Math.cos(Math.PI * 2 * vuelta); // frente y espalda ven la misma franja
    uv[i * 2] = zona.x0 + fx * (zona.x1 - zona.x0);
    uv[i * 2 + 1] = 1 - (zona.y0 + (0.15 + 0.7 * fy) * (zona.y1 - zona.y0));
  }
  malla.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  malla.geometry.setAttribute('aLado', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
}

/** Borde de la manga: el color del puño (el extremo de la zona de la manga). */
function proyectarPuno(malla: THREE.Mesh, zona: ZonaFoto, haciaIzquierda: boolean): void {
  const pos = malla.geometry.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const x = haciaIzquierda ? zona.x0 + (zona.x1 - zona.x0) * 0.08 : zona.x1 - (zona.x1 - zona.x0) * 0.08;
  const y = 1 - (zona.y0 + zona.y1) / 2;
  for (let i = 0; i < pos.count; i += 1) uv.set([x, y], i * 2);
  malla.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  malla.geometry.setAttribute('aLado', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
}

/**
 * Coloca la foto de la prenda sobre su malla 3D.
 * Con zonas del análisis (fotos subidas o recortadas en el servidor):
 *   superior -> torso a la zona del torso y cada manga a su zona;
 *   resto -> toda la prenda a la zona de la prenda (estirada, no "contain").
 * Sin zonas: proyección frontal (o lateral en calzado) "contain".
 */
export function proyectarFoto(
  grupo: THREE.Object3D,
  prenda: Pick<PrendaVirtual, 'categoria' | 'zonas' | 'estampado' | 'puntaDerecha'>,
  esTela: (m: THREE.Mesh) => boolean
): void {
  const modo = prenda.categoria === 'Calzado' ? 'lado' : 'frente';
  const zonas = prenda.zonas;
  // Un estampado grande al frente no se repite en la espalda (se vería al revés).
  const espaldaConFoto = prenda.estampado !== 'estampado';
  const tela = mallasDe(grupo, esTela);

  if (modo === 'lado') {
    for (const zapato of grupo.children) {
      proyectarPlanar(zapato, mallasDe(zapato, esTela), 'lado', zonas?.prenda ?? null, { puntaDerecha: prenda.puntaDerecha });
    }
    return;
  }
  if (zonas?.torso && (prenda.categoria === 'Torso' || prenda.categoria === 'Vestido')) {
    const esManga = (m: THREE.Mesh) => /^manga_(izq|der)/.test(m.name);
    proyectarPlanar(grupo, tela.filter((m) => !esManga(m)), 'frente', zonas.torso, { espaldaConFoto });
    for (const m of tela.filter(esManga)) {
      // La manga izquierda del avatar (+X) se ve a la derecha de la foto frontal.
      const izquierdaAvatar = m.name.startsWith('manga_izq');
      const zona = izquierdaAvatar ? zonas.mangaDerecha : zonas.mangaIzquierda;
      if (!zona) {
        proyectarPlanar(grupo, [m], 'frente', zonas.torso, { espaldaConFoto });
      } else if (m.name.endsWith('_borde')) {
        proyectarPuno(m, zona, !izquierdaAvatar);
      } else {
        proyectarManga(m, zona, !izquierdaAvatar);
      }
    }
    return;
  }
  proyectarPlanar(grupo, tela, 'frente', zonas?.prenda ?? null, { espaldaConFoto });
}

/** Libera las fotos cargadas (al destruir el visor). */
export function liberarFotos(): void {
  fotos.clear();
}
