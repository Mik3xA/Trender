import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

import { environment } from '../../environments/environment';

import { Medidas, calcularProporciones, interpolarMedidas } from '../probador/cuerpo';
import { PrendaVirtual, estiloDe } from '../probador/prendas';
import {
  Esqueleto,
  MaterialesPrenda,
  construirCalzado,
  construirCuerpo,
  construirEsqueleto,
  construirInferior,
  construirSuperior,
  construirVestido,
} from './cuerpo-3d';
import { aplicarMedidasAGlb, alturaDe } from './avatar-glb';
import { aplicarTono } from './piel';
import { liberarFotos, liberarTexturas, materialConFoto, materialTela, proyectarFoto } from './telas';

const DURACION_TRANSICION_MS = 380;

/**
 * Motor 3D del probador: escena de estudio, maniquí paramétrico y prendas.
 * No depende de Angular; el componente Visor3d lo crea y lo destruye.
 */
export class MotorAvatar {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly escena = new THREE.Scene();
  private readonly camara = new THREE.PerspectiveCamera(28, 1, 0.05, 40);
  private readonly controles: OrbitControls;
  private readonly entorno: THREE.Texture;
  private readonly materialPiel = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#e6e2db'),
    roughness: 0.58,
    metalness: 0,
    clearcoat: 0.25,
    clearcoatRoughness: 0.55,
    sheen: 0.25,
    sheenColor: new THREE.Color('#ffffff'),
  });
  private readonly materialSuela = new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.7 });
  private readonly materialesPrenda = new Map<string, THREE.MeshPhysicalMaterial>();
  private readonly avatar = new THREE.Group();

  private medidasActuales: Medidas | null = null;
  /** Avatar GLB realista (opcional) por género y su altura original. */
  private readonly modelosGlb = new Map<string, { escena: THREE.Object3D; altura: number } | null>();
  private readonly pmrem: THREE.PMREMGenerator;
  private medidasDestino: Medidas | null = null;
  private conjunto: PrendaVirtual[] = [];
  private inicioTransicion = 0;
  private origenTransicion: Medidas | null = null;
  private frame = 0;
  private alturaEncuadre = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // Iluminación basada en imagen: estudio procedimental, o un HDRI si se configura.
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const habitacion = new RoomEnvironment();
    this.entorno = this.pmrem.fromScene(habitacion, 0.04).texture;
    habitacion.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.escena.environment = this.entorno;
    if (environment.hdri) this.cargarHdri(environment.hdri);
    this.escena.environmentIntensity = 0.55;

    this.prepararLuces();
    this.prepararSuelo();
    this.escena.add(this.avatar);

    this.controles = new OrbitControls(this.camara, canvas);
    this.controles.enableDamping = true;
    this.controles.dampingFactor = 0.08;
    this.controles.enablePan = false;
    this.controles.minPolarAngle = Math.PI * 0.2;
    this.controles.maxPolarAngle = Math.PI * 0.55;
    this.controles.autoRotateSpeed = 0.8;

    this.animar();
  }

  /** Cambia el cuerpo (con una transición suave) y/o la ropa. */
  actualizar(medidas: Medidas, conjunto: PrendaVirtual[]): void {
    const cambioCuerpo = JSON.stringify(medidas) !== JSON.stringify(this.medidasDestino);
    const cambioRopa = JSON.stringify(conjunto) !== JSON.stringify(this.conjunto);
    this.conjunto = conjunto.map((p) => ({ ...p }));
    if (cambioCuerpo) {
      this.origenTransicion = this.medidasActuales;
      this.medidasDestino = { ...medidas };
      this.inicioTransicion = performance.now();
      if (!this.origenTransicion) this.reconstruir(medidas, true);
    } else if (cambioRopa && this.medidasActuales) {
      this.reconstruir(this.medidasActuales, false);
    }
  }

  /** Tono del cuerpo: maniquí de porcelana o piel PBR. */
  setTono(tono: string): void {
    aplicarTono(this.materialPiel, tono);
  }

  setAutoRotar(activo: boolean): void {
    this.controles.autoRotate = activo;
  }

  restablecerCamara(): void {
    this.encuadrar(this.alturaEncuadre || 1.7);
  }

  redimensionar(ancho: number, alto: number): void {
    if (!ancho || !alto) return;
    this.renderer.setSize(ancho, alto, false);
    this.camara.aspect = ancho / alto;
    this.camara.updateProjectionMatrix();
  }

  destruir(): void {
    cancelAnimationFrame(this.frame);
    this.controles.dispose();
    this.liberar(this.avatar);
    this.escena.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
    this.materialPiel.dispose();
    this.materialSuela.dispose();
    for (const m of this.materialesPrenda.values()) {
      m.map?.dispose();
      m.dispose();
    }
    this.materialesPrenda.clear();
    liberarTexturas();
    liberarFotos();
    this.entorno.dispose();
    this.escena.environment?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------ escena

  private prepararLuces(): void {
    this.escena.add(new THREE.HemisphereLight('#ffffff', '#d8d2c8', 0.9));

    const principal = new THREE.DirectionalLight('#fff6ea', 2.3);
    principal.position.set(2.2, 4.2, 3.2);
    principal.castShadow = true;
    principal.shadow.mapSize.set(2048, 2048);
    principal.shadow.bias = -0.0004;
    principal.shadow.normalBias = 0.02;
    principal.shadow.radius = 5;
    const sombra = principal.shadow.camera;
    sombra.left = -1.2;
    sombra.right = 1.2;
    sombra.top = 2.4;
    sombra.bottom = -0.4;
    this.escena.add(principal);

    const relleno = new THREE.DirectionalLight('#eef2ff', 0.55);
    relleno.position.set(-3, 2, 1.5);
    this.escena.add(relleno);

    const contraluz = new THREE.DirectionalLight('#ffffff', 1.1);
    contraluz.position.set(0, 3, -4);
    this.escena.add(contraluz);
  }

  private prepararSuelo(): void {
    const suelo = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), new THREE.ShadowMaterial({ opacity: 0.16 }));
    suelo.rotation.x = -Math.PI / 2;
    suelo.receiveShadow = true;
    this.escena.add(suelo);
  }

  private encuadrar(altura: number): void {
    this.alturaEncuadre = altura;
    const centro = altura * 0.53;
    const fov = THREE.MathUtils.degToRad(this.camara.fov);
    const distancia = (altura * 0.62) / Math.tan(fov / 2);
    this.camara.position.set(distancia * 0.2, centro + altura * 0.05, distancia);
    this.controles.target.set(0, centro, 0);
    this.controles.minDistance = distancia * 0.45;
    this.controles.maxDistance = distancia * 1.5;
    this.controles.update();
  }

  // ------------------------------------------------------------ avatar

  private cargarHdri(url: string): void {
    new HDRLoader().load(url, (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      this.escena.environment = this.pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
    });
  }

  private materialesPara(prenda: PrendaVirtual): MaterialesPrenda {
    const estilo = estiloDe(prenda);
    const clave = `${prenda.color}|${estilo.tela}|${prenda.imagen ?? ''}`;
    if (!this.materialesPrenda.has(clave)) {
      // Con foto de la tienda: la prenda real proyectada; si no, tela procedimental de su color.
      const material = prenda.imagen ? materialConFoto(prenda.imagen, prenda.color, estilo.tela) : materialTela(prenda.color, estilo.tela);
      this.materialesPrenda.set(clave, material);
    }
    const detalle = prenda.categoria === 'Calzado' ? this.materialSuela : this.materialesPrenda.get(clave)!;
    return { tela: this.materialesPrenda.get(clave)!, detalle };
  }

  private vestir(esq: Esqueleto): THREE.Object3D[] {
    const inferior = this.conjunto.find((p) => p.categoria === 'Piernas');
    // La prenda superior va por fuera: de la cintura para abajo es al menos tan holgada como el pantalón.
    const holguraCadera = inferior ? estiloDe(inferior).holgura + 0.035 : undefined;
    return this.conjunto.map((prenda) => {
      const estilo = prenda.categoria === 'Torso' ? { ...estiloDe(prenda), holguraCadera } : estiloDe(prenda);
      const mat = this.materialesPara(prenda);
      let grupo: THREE.Object3D;
      switch (prenda.categoria) {
        case 'Torso':
          grupo = construirSuperior(esq, estilo, mat);
          break;
        case 'Piernas':
          grupo = construirInferior(esq, estilo, prenda.tipo, mat);
          break;
        case 'Vestido':
          grupo = construirVestido(esq, estilo, mat);
          break;
        default:
          grupo = construirCalzado(esq, estilo, mat);
      }
      if (prenda.imagen) {
        const esTela = (m: THREE.Mesh) => m.material === mat.tela;
        if (prenda.categoria === 'Calzado') grupo.children.forEach((zapato) => proyectarFoto(zapato, 'lado', esTela));
        else proyectarFoto(grupo, 'frente', esTela);
      }
      return grupo;
    });
  }

  private reconstruir(medidas: Medidas, encuadrar: boolean): void {
    this.liberar(this.avatar);
    this.avatar.clear();
    const proporciones = calcularProporciones(medidas);
    const esqueleto = construirEsqueleto(proporciones);
    const glb = this.modeloGlb(medidas.genero);
    if (glb) {
      aplicarMedidasAGlb(glb.escena, medidas, glb.altura);
      this.avatar.add(glb.escena);
    } else {
      this.avatar.add(construirCuerpo(esqueleto, this.materialPiel));
    }
    for (const prenda of this.vestir(esqueleto)) this.avatar.add(prenda);
    this.medidasActuales = medidas;
    if (encuadrar) this.encuadrar(proporciones.altura);
  }

  /** Avatar GLB del género si está configurado y ya cargó; lo carga la primera vez. */
  private modeloGlb(genero: Medidas['genero']): { escena: THREE.Object3D; altura: number } | null {
    const url = environment.avatares[genero];
    if (!url) return null;
    if (!this.modelosGlb.has(genero)) {
      this.modelosGlb.set(genero, null);
      new GLTFLoader().load(
        url,
        (gltf) => {
          gltf.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              m.castShadow = true;
              m.receiveShadow = true;
            }
          });
          this.modelosGlb.set(genero, { escena: gltf.scene, altura: alturaDe(gltf.scene) });
          if (this.medidasActuales?.genero === genero) this.reconstruir(this.medidasActuales, false);
        },
        undefined,
        () => console.warn(`No se pudo cargar el avatar ${url}; se usa el cuerpo paramétrico.`)
      );
    }
    return this.modelosGlb.get(genero) ?? null;
  }

  private liberar(objeto: THREE.Object3D): void {
    // El GLB se reutiliza entre reconstrucciones: no se liberan sus geometrías.
    const glbs = new Set([...this.modelosGlb.values()].map((g) => g?.escena));
    objeto.traverse((o) => {
      if (glbs.has(o)) return;
      let dentroDeGlb = false;
      o.traverseAncestors((a) => (dentroDeGlb ||= glbs.has(a)));
      if (!dentroDeGlb) (o as THREE.Mesh).geometry?.dispose();
    });
  }

  private animar = (): void => {
    this.frame = requestAnimationFrame(this.animar);
    if (this.origenTransicion && this.medidasDestino) {
      const t = Math.min(1, (performance.now() - this.inicioTransicion) / DURACION_TRANSICION_MS);
      const suave = 1 - (1 - t) ** 3;
      this.reconstruir(interpolarMedidas(this.origenTransicion, this.medidasDestino, suave), false);
      if (t >= 1) {
        const cambioAltura = Math.abs(this.medidasDestino.altura - this.origenTransicion.altura) > 2;
        this.reconstruir(this.medidasDestino, cambioAltura);
        this.origenTransicion = null;
      }
    }
    this.controles.update();
    this.renderer.render(this.escena, this.camara);
  };
}
