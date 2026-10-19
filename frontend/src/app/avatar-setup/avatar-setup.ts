import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  ViewEncapsulation
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const WEBHOOK_URL = 'http://localhost:3000/webhooks/recibir';
const DEFAULT_CUSTOMER_EMAIL = 'usuario@trender.com';

export type Complexion = 'Delgada' | 'Atlética' | 'Media' | 'Robusta';
export type Genero = 'Masculino' | 'Femenino';

const BASE_HEIGHT_CM = 170;
const BASE_WEIGHT_KG = 70;

// El origen del grupo es la planta de los pies: estatura relativa al maniquí base
const NEUTRAL_GROSOR = BASE_WEIGHT_KG / Math.pow(BASE_HEIGHT_CM / 100, 2);

// Límites biológicos tolerantes: enanismo a gigantismo
const LIMITS = {
  estatura: { min: 80, max: 250 },
  peso: { min: 30, max: 300 }
} as const;

const LIMIT_MESSAGE =
  `Los valores exceden el rango soportado (${LIMITS.estatura.min}-${LIMITS.estatura.max} cm / ` +
  `${LIMITS.peso.min}-${LIMITS.peso.max} kg). Se muestran proporciones limitadas al rango seguro.`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

interface ComplexionProfile {
  torsoXZ: number;
  pelvisXZ: number;
  shoulderX: number;
  armXZ: number;
  legXZ: number;
}

// Perfiles anatómicos: grasa reparte al torso/pelvis, músculo a hombros/brazos, delgada reduce todo
const COMPLEXION_PROFILE: Record<Complexion, ComplexionProfile> = {
  Delgada: { torsoXZ: 0.8, pelvisXZ: 0.8, shoulderX: 0.8, armXZ: 0.8, legXZ: 0.8 },
  Media: { torsoXZ: 1.0, pelvisXZ: 1.0, shoulderX: 1.0, armXZ: 1.0, legXZ: 1.0 },
  Atlética: { torsoXZ: 1.05, pelvisXZ: 1.0, shoulderX: 1.35, armXZ: 1.3, legXZ: 1.05 },
  Robusta: { torsoXZ: 1.6, pelvisXZ: 1.55, shoulderX: 1.12, armXZ: 1.12, legXZ: 1.18 }
};

const GENDER_SHOULDER: Record<Genero, number> = {
  Masculino: 1.0,
  Femenino: 0.92
};

interface RigState {
  height: number;
  torsoXZ: number;
  pelvisXZ: number;
  shoulderX: number;
  armXZ: number;
  legXZ: number;
}

const SIDES = ['izq', 'der'] as const;

interface MarqueeItem {
  image: string;
  size: string;
  label: string;
}

// Catálogo del carrusel: se duplica para crear el bucle continuo
const MARQUEE_ITEMS: MarqueeItem[] = [
  {
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=600&q=80',
    size: 'Ajuste 98% preciso',
    label: 'Chaqueta Oversize'
  },
  {
    image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=600&q=80',
    size: 'S',
    label: 'Vestido Midi'
  },
  {
    image: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=600&q=80',
    size: 'M',
    label: 'Blazer Entallado'
  },
  {
    image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=600&q=80',
    size: 'L',
    label: 'Camisa de Lino'
  },
  {
    image: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=600&q=80',
    size: 'XL',
    label: 'Pantalón Wide Leg'
  },
  {
    image: 'https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?auto=format&fit=crop&w=600&q=80',
    size: 'Ajuste 97% preciso',
    label: 'Punto Grueso'
  }
];

@Component({
  selector: 'app-avatar-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './avatar-setup.html',
  styleUrl: './avatar-setup.scss',
  encapsulation: ViewEncapsulation.None
})
export class AvatarSetupComponent implements AfterViewInit, OnDestroy {
  @ViewChild('rendererCanvas', { static: true })
  private rendererCanvas!: ElementRef<HTMLCanvasElement>;

  estatura: number | null = null;
  peso: number | null = null;
  complexion: Complexion = 'Atlética';
  genero: Genero = 'Masculino';

  isGenerating = false;
  modelReady = false;
  alertaValidacion: string | null = null;

  // Bloqueo de funciones avanzadas: requieren cuenta
  mostrarModalAuth = false;
  tipoAccionAuth: 'escaneo' | 'subir_modelo' | '' = '';

  readonly marqueeItems: MarqueeItem[] = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private rootGroup!: THREE.Group;
  private modelGroup!: THREE.Group;
  private resizeObserver?: ResizeObserver;
  private viewport?: HTMLElement;

  private animationId = 0;
  private webglReady = false;
  private lastFrameTime = 0;

  private readonly basePositions = new Map<string, THREE.Vector3>();
  private readonly baseScales = new Map<string, THREE.Vector3>();

  private readonly current: RigState = {
    height: 1,
    torsoXZ: 1,
    pelvisXZ: 1,
    shoulderX: 1,
    armXZ: 1,
    legXZ: 1
  };

  private readonly target: RigState = { ...this.current };

  // Maniquí de estudio: porcelana mate / arcilla mineral
  private readonly mannequinMaterial = new THREE.MeshStandardMaterial({
    color: 0xe7e5e1,
    roughness: 0.55,
    metalness: 0.05
  });

  // Ropa interior sobria: verde oliva oscuro / carbón muteado
  private readonly underwearMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d3728,
    roughness: 0.7,
    metalness: 0.05
  });

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngAfterViewInit(): void {
    this.validarMedidas();

    this.zone.runOutsideAngular(() => {
      try {
        this.initThree();
      } catch (error) {
        console.error('No se pudo inicializar WebGL:', error);
      }
    });

    this.setupResize();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationId);
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    this.controls?.dispose();
    this.disposeSceneResources();
    this.renderer?.dispose();
    this.mannequinMaterial.dispose();
    this.underwearMaterial.dispose();
  }

  // ---------- Entrada del formulario ----------

  onEstaturaChange(value: number | null): void {
    this.estatura = value;
    this.validarMedidas();
    this.syncModel();
  }

  onPesoChange(value: number | null): void {
    this.peso = value;
    this.validarMedidas();
    this.syncModel();
  }

  onComplexionChange(value: Complexion): void {
    this.complexion = value;
    this.syncModel();
  }

  onGeneroChange(value: Genero): void {
    this.genero = value;
    this.buildMannequin();
    this.syncModel();
  }

  // ---------- Bloqueo de cuenta (funciones avanzadas) ----------

  requerirCuenta(accion: 'escaneo' | 'subir_modelo'): void {
    this.tipoAccionAuth = accion;
    this.mostrarModalAuth = true;
  }

  cerrarModalAuth(): void {
    this.mostrarModalAuth = false;
    this.tipoAccionAuth = '';
  }

  // ---------- Validación biológica ----------

  validarMedidas(): void {
    const fueraDeRango =
      (this.estatura !== null &&
        (this.estatura < LIMITS.estatura.min || this.estatura > LIMITS.estatura.max)) ||
      (this.peso !== null && (this.peso < LIMITS.peso.min || this.peso > LIMITS.peso.max));

    this.alertaValidacion = fueraDeRango ? LIMIT_MESSAGE : null;
  }

  private syncModel(): void {
    if (!this.webglReady) {
      return;
    }
    this.updateModelProportions(
      this.estatura ?? BASE_HEIGHT_CM,
      this.peso ?? BASE_WEIGHT_KG,
      this.complexion,
      this.genero
    );
  }

  // ---------- Motor de complexión (clamping seguro) ----------

  updateModelProportions(
    estatura: number,
    peso: number,
    complexion: Complexion,
    genero: Genero
  ): void {
    // Math.min(Math.max(...)): 800 kg o 40 cm se dibujan al límite seguro sin romper la matriz
    const estaturaSafe = clamp(estatura, LIMITS.estatura.min, LIMITS.estatura.max);
    const pesoSafe = clamp(peso, LIMITS.peso.min, LIMITS.peso.max);

    // IMC dinámico: factorGrosor = peso(kg) / estatura(m)^2
    const estaturaM = estaturaSafe / 100;
    const factorGrosor = pesoSafe / (estaturaM * estaturaM);
    const grosor = clamp(factorGrosor / NEUTRAL_GROSOR, 0.55, 2.4);

    const profile = COMPLEXION_PROFILE[complexion];
    const shoulderGender = GENDER_SHOULDER[genero];

    // La estatura escala desde la planta de los pies (origen del grupo)
    this.target.height = clamp(estaturaSafe / BASE_HEIGHT_CM, 0.4, 1.6);

    // Grasa: torso y pelvis se ensanchan con el IMC y la complexión
    this.target.torsoXZ = clamp(profile.torsoXZ * (0.8 + 0.2 * grosor), 0.7, 1.9);
    this.target.pelvisXZ = clamp(profile.pelvisXZ * (0.8 + 0.2 * grosor), 0.7, 1.9);

    // Músculo / volumen de hombros
    this.target.shoulderX = clamp(
      profile.shoulderX * shoulderGender * (0.9 + 0.1 * grosor),
      0.7,
      1.7
    );

    // Extremidades: multiplicadas directamente por el factor de grosor (IMC)
    this.target.armXZ = clamp(profile.armXZ * grosor, 0.7, 2.2);
    this.target.legXZ = clamp(profile.legXZ * grosor, 0.7, 2.2);

    this.updateFraming(this.target.height);
  }

  // Reencuadra la cámara manteniendo el ángulo de órbita del usuario
  private updateFraming(heightScale: number): void {
    if (!this.controls || !this.camera) {
      return;
    }

    const targetY = 0.9 * heightScale;
    const deltaY = targetY - this.controls.target.y;
    this.controls.target.y = targetY;
    this.camera.position.y += deltaY;

    const offset = new THREE.Vector3().subVectors(
      this.camera.position,
      this.controls.target
    );
    offset.setLength(3.05 * clamp(heightScale, 0.55, 1.5));
    this.camera.position.copy(this.controls.target).add(offset);
  }

  // ---------- Inicialización WebGL ----------

  private initThree(): void {
    const canvas = this.rendererCanvas.nativeElement;
    const host = canvas.parentElement ?? canvas;
    this.viewport = host;

    // Fondo transparente: el degradado de estudio del contenedor se ve detrás del maniquí
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.camera.position.set(0, 1.1, 3.05);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.95, 0);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.rotateSpeed = 0.8;
    this.controls.minPolarAngle = Math.PI * 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.86;

    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    this.modelGroup = new THREE.Group();
    this.rootGroup.add(this.modelGroup);

    this.addLights();
    this.addStage();

    this.webglReady = true;
    this.updateModelProportions(
      this.estatura ?? BASE_HEIGHT_CM,
      this.peso ?? BASE_WEIGHT_KG,
      this.complexion,
      this.genero
    );
    this.buildMannequin();

    this.updateSize(host);

    this.lastFrameTime = performance.now();
    this.animate();
  }

  private addLights(): void {
    // Luz ambiental cálida y suave
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));

    // Luz principal neutra desde arriba a la derecha con sombras suaves
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(4, 7, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -2;
    keyLight.shadow.bias = -0.0004;
    this.scene.add(keyLight);

    // Luz de relleno cálida tenue desde la izquierda
    const fillLight = new THREE.DirectionalLight(0xf5f0e6, 0.4);
    fillLight.position.set(-4, 3, -2);
    this.scene.add(fillLight);
  }

  private addStage(): void {
    // Plano de sombra de estudio que integra el maniquí con el fondo
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.ShadowMaterial({ opacity: 0.15 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  // ---------- Generación procedural del maniquí ----------

  private buildMannequin(): void {
    if (!this.modelGroup) {
      return;
    }

    for (const child of [...this.modelGroup.children]) {
      this.modelGroup.remove(child);
      this.disposeGeometries(child);
    }
    this.basePositions.clear();
    this.baseScales.clear();

    const mannequin =
      this.genero === 'Femenino'
        ? this.buildFemaleMannequin()
        : this.buildMaleMannequin();
    this.modelGroup.add(mannequin);

    Object.assign(this.current, this.target);
    this.applyRig();
  }

  // Registra una pieza anclada por su posición absoluta (origen = planta de los pies)
  private part(
    geometry: THREE.BufferGeometry,
    name: string,
    x: number,
    y: number,
    z: number,
    scale?: THREE.Vector3,
    material: THREE.Material = this.mannequinMaterial
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    if (scale) {
      mesh.scale.copy(scale);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.basePositions.set(name, new THREE.Vector3(x, y, z));
    this.baseScales.set(name, mesh.scale.clone());
    return mesh;
  }

  private buildHeadAndNeck(group: THREE.Group): void {
    const skull = new THREE.SphereGeometry(0.105, 32, 24);
    group.add(this.part(skull, 'cabeza', 0, 1.58, 0, new THREE.Vector3(0.92, 1.16, 0.96)));
    group.add(this.part(new THREE.CylinderGeometry(0.05, 0.055, 0.11, 20), 'cuello', 0, 1.47, 0));
  }

  // Ropa interior sobria que cubre la cadera (se deforma con la pelvis)
  private addUnderwear(group: THREE.Group, pelvisRadius: number): void {
    group.add(
      this.part(
        new THREE.CylinderGeometry(pelvisRadius, pelvisRadius * 0.92, 0.2, 24),
        'ropa_interior',
        0,
        0.9,
        0,
        undefined,
        this.underwearMaterial
      )
    );
  }

  private buildLimbs(
    group: THREE.Group,
    arm: { shoulderX: number; upperR: number; foreR: number },
    leg: { hipX: number; thighR: number; calfR: number }
  ): void {
    for (const side of SIDES) {
      const sign = side === 'izq' ? -1 : 1;

      // Hombro (esfera) + brazo + antebrazo + mano
      group.add(
        this.part(
          new THREE.SphereGeometry(0.072, 20, 16),
          `hombro_${side}`,
          sign * arm.shoulderX,
          1.37,
          0
        )
      );
      group.add(
        this.part(
          new THREE.CylinderGeometry(arm.upperR, arm.foreR * 0.95, 0.28, 18),
          `brazo_${side}`,
          sign * (arm.shoulderX + 0.02),
          1.22,
          0
        )
      );
      group.add(
        this.part(
          new THREE.CylinderGeometry(arm.foreR * 0.95, arm.foreR * 0.8, 0.27, 18),
          `antebrazo_${side}`,
          sign * (arm.shoulderX + 0.02),
          0.965,
          0
        )
      );
      group.add(
        this.part(
          new THREE.SphereGeometry(arm.foreR * 0.95, 16, 12),
          `mano_${side}`,
          sign * (arm.shoulderX + 0.02),
          0.8,
          0
        )
      );

      // Pierna: muslo + pantorrilla + pie (planta en y = 0)
      group.add(
        this.part(
          new THREE.CylinderGeometry(leg.thighR, leg.thighR * 0.8, 0.38, 22),
          `muslo_${side}`,
          sign * leg.hipX,
          0.66,
          0
        )
      );
      group.add(
        this.part(
          new THREE.CylinderGeometry(leg.calfR, leg.calfR * 0.78, 0.4, 20),
          `pantorrilla_${side}`,
          sign * leg.hipX,
          0.27,
          0
        )
      );
      group.add(
        this.part(
          new THREE.SphereGeometry(0.05, 18, 14),
          `pie_${side}`,
          sign * leg.hipX,
          0.035,
          0.045,
          new THREE.Vector3(1, 0.7, 1.7)
        )
      );
    }
  }

  buildMaleMannequin(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'maniqui_masculino';

    // Espalda en V: torso ancho arriba, cintura/ pelvis estrecha
    group.add(this.part(new THREE.CylinderGeometry(0.21, 0.135, 0.4, 28), 'torso', 0, 1.2, 0));
    group.add(this.part(new THREE.CylinderGeometry(0.115, 0.1, 0.16, 24), 'pelvis', 0, 0.92, 0));
    this.addUnderwear(group, 0.14);

    this.buildHeadAndNeck(group);
    this.buildLimbs(
      group,
      { shoulderX: 0.2, upperR: 0.055, foreR: 0.045 },
      { hipX: 0.085, thighR: 0.085, calfR: 0.068 }
    );

    return group;
  }

  buildFemaleMannequin(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'maniqui_femenino';

    // Hombros estrechos y pelvis más ancha que el torso
    group.add(this.part(new THREE.CylinderGeometry(0.155, 0.115, 0.4, 28), 'torso', 0, 1.2, 0));
    group.add(this.part(new THREE.CylinderGeometry(0.15, 0.135, 0.16, 24), 'pelvis', 0, 0.92, 0));
    this.addUnderwear(group, 0.17);

    // Busto: dos semi-esferas en la zona pectoral superior
    for (const side of SIDES) {
      const sign = side === 'izq' ? -1 : 1;
      const bust = new THREE.SphereGeometry(0.072, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const mesh = this.part(
        bust,
        `busto_${side}`,
        sign * 0.065,
        1.3,
        0.1,
        new THREE.Vector3(1, 1, 0.9)
      );
      mesh.rotation.x = Math.PI / 2;
      group.add(mesh);
    }

    this.buildHeadAndNeck(group);
    this.buildLimbs(
      group,
      { shoulderX: 0.155, upperR: 0.046, foreR: 0.038 },
      { hipX: 0.095, thighR: 0.088, calfR: 0.068 }
    );

    return group;
  }

  // ---------- Deformación dirigida por nombre de pieza ----------

  private applyRig(): void {
    const t = this.current;

    if (this.modelGroup) {
      this.modelGroup.scale.y = t.height;
    }

    // Torso y pelvis (grasa / anchura)
    this.deform('torso', t.torsoXZ, 1, t.torsoXZ, 1);
    this.deform('pelvis', t.pelvisXZ, 1, t.pelvisXZ, 1);
    this.deform('ropa_interior', t.pelvisXZ, 1, t.pelvisXZ, 1);
    this.deform('busto_izq', t.torsoXZ, 1, t.torsoXZ, t.torsoXZ);
    this.deform('busto_der', t.torsoXZ, 1, t.torsoXZ, t.torsoXZ);

    const shoulderSpread = t.torsoXZ * t.shoulderX;

    for (const side of SIDES) {
      this.deform(`hombro_${side}`, t.shoulderX, 1, t.shoulderX, shoulderSpread);
      this.deform(`brazo_${side}`, t.armXZ, 1, t.armXZ, shoulderSpread);
      this.deform(`antebrazo_${side}`, t.armXZ, 1, t.armXZ, shoulderSpread);
      this.deform(`mano_${side}`, t.armXZ, 1, t.armXZ, shoulderSpread);

      this.deform(`muslo_${side}`, t.legXZ, 1, t.legXZ, t.pelvisXZ);
      this.deform(`pantorrilla_${side}`, t.legXZ, 1, t.legXZ, t.pelvisXZ);
      this.deform(`pie_${side}`, t.legXZ, 1, t.legXZ, t.pelvisXZ);
    }
  }

  // Busca la pieza por nombre y aplica escala + desplazamiento lateral coherente con el torso
  private deform(
    name: string,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    xFactor: number
  ): void {
    const mesh = this.modelGroup?.getObjectByName(name) as THREE.Mesh | undefined;
    if (!mesh) {
      return;
    }

    const baseScale = this.baseScales.get(name);
    if (baseScale) {
      mesh.scale.set(
        baseScale.x * scaleX,
        baseScale.y * scaleY,
        baseScale.z * scaleZ
      );
    }

    const basePosition = this.basePositions.get(name);
    if (basePosition) {
      mesh.position.x = basePosition.x * xFactor;
    }
  }

  // ---------- Loop de render ----------

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const delta = Math.min((now - this.lastFrameTime) / 1000 || 0, 0.1);
    this.lastFrameTime = now;

    // Interpolación orgánica hacia el objetivo (~1 segundo)
    const alpha = 1 - Math.exp(-delta / 0.28);
    this.current.height = THREE.MathUtils.lerp(this.current.height, this.target.height, alpha);
    this.current.torsoXZ = THREE.MathUtils.lerp(this.current.torsoXZ, this.target.torsoXZ, alpha);
    this.current.pelvisXZ = THREE.MathUtils.lerp(
      this.current.pelvisXZ,
      this.target.pelvisXZ,
      alpha
    );
    this.current.shoulderX = THREE.MathUtils.lerp(
      this.current.shoulderX,
      this.target.shoulderX,
      alpha
    );
    this.current.armXZ = THREE.MathUtils.lerp(this.current.armXZ, this.target.armXZ, alpha);
    this.current.legXZ = THREE.MathUtils.lerp(this.current.legXZ, this.target.legXZ, alpha);

    this.applyRig();

    const wireframe = this.isGenerating;
    if (this.mannequinMaterial.wireframe !== wireframe) {
      this.mannequinMaterial.wireframe = wireframe;
      this.mannequinMaterial.needsUpdate = true;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  // ---------- Resize ----------

  // Observa el contenedor del visor y la ventana para reencuadrar el render
  private setupResize(): void {
    const host = this.viewport ?? this.rendererCanvas?.nativeElement.parentElement;
    if (!host || !this.renderer || !this.camera) {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => this.updateSize(host));
    this.resizeObserver.observe(host);
    window.addEventListener('resize', this.onWindowResize);
    this.updateSize(host);
  }

  private onWindowResize = (): void => {
    if (this.viewport) {
      this.updateSize(this.viewport);
    }
  };

  private updateSize(host: HTMLElement): void {
    if (!this.renderer || !this.camera) {
      return;
    }
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // ---------- Liberación de memoria ----------

  private disposeGeometries(object: THREE.Object3D): void {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
    });
  }

  private disposeSceneResources(): void {
    this.scene?.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) {
        material.forEach((entry) => entry.dispose());
      } else if (material && material !== this.mannequinMaterial && material !== this.underwearMaterial) {
        material.dispose();
      }
    });
  }

  // ---------- Flujo de generación (webhook) ----------

  generarModelo(): void {
    this.validarMedidas();

    if (!this.estatura || !this.peso) {
      alert('Ingresa estatura y peso');
      return;
    }

    this.isGenerating = true;
    this.modelReady = false;

    const payload = {
      transaction_id: crypto.randomUUID(),
      amount: 100,
      customer_email: DEFAULT_CUSTOMER_EMAIL,
      currency: 'USD',
      avatar_data: {
        estatura: this.estatura,
        peso: this.peso,
        complexion: this.complexion,
        genero: this.genero
      }
    };

    this.http.post(WEBHOOK_URL, payload).subscribe({
      next: (respuesta) => {
        console.log('Webhook procesado en backend:', respuesta);
        this.isGenerating = false;
        this.modelReady = true;
        this.cdr.detectChanges();
      },
      error: (err: HttpErrorResponse) => {
        const mensaje = err.error?.error ?? err.message;
        console.error(`Backend respondió ${err.status}: ${mensaje}`);
        const detalles = err.error?.errors;
        if (Array.isArray(detalles)) {
          for (const detalle of detalles) {
            if (typeof detalle === 'string') {
              console.error(` - ${detalle}`);
            } else {
              console.error(` - ${detalle.field}: ${detalle.message}`);
            }
          }
        }
        this.isGenerating = false;
        this.cdr.detectChanges();
      }
    });
  }
}
