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

const LIMITS = {
  estatura: { min: 120, max: 230 },
  peso: { min: 35, max: 200 }
} as const;

// Distribución de masa: el torso recibe casi todo el volumen, las extremidades poco
const TORSO_MASS_FACTOR = 1.2;
const LIMB_MASS_FACTOR = 0.5;

const COMPLEXION_WIDTH: Record<Complexion, number> = {
  Delgada: 0.88,
  Atlética: 1.0,
  Media: 1.05,
  Robusta: 1.22
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const UP = new THREE.Vector3(0, 1, 0);

interface GenderProfile {
  shoulderX: number;
  hipX: number;
  waistR: number;
  chestR: number;
  bust: boolean;
}

const GENDER_PROFILES: Record<Genero, GenderProfile> = {
  Masculino: { shoulderX: 0.215, hipX: 0.155, waistR: 0.155, chestR: 0.2, bust: false },
  Femenino: { shoulderX: 0.185, hipX: 0.18, waistR: 0.125, chestR: 0.17, bust: true }
};

interface LimbAnchor {
  group: THREE.Group;
  baseX: number;
}

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

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private rootGroup!: THREE.Group;
  private bodyGroup!: THREE.Group;
  private torsoGroup!: THREE.Group;
  private armGroups: LimbAnchor[] = [];
  private legGroups: LimbAnchor[] = [];
  private resizeObserver?: ResizeObserver;

  private animationId = 0;
  private webglReady = false;

  private currentHeight = 1;
  private targetHeight = 1;
  private readonly currentMass = { torso: 1, limb: 1 };
  private readonly targetMass = { torso: 1, limb: 1 };

  private readonly skinMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xe2e8f0,
    roughness: 0.6,
    metalness: 0.1,
    clearcoat: 0.15,
    clearcoatRoughness: 0.7
  });

  private readonly underwearMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x1e293b,
    roughness: 0.6,
    metalness: 0.1,
    clearcoat: 0.2,
    clearcoatRoughness: 0.8
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
        this.updateModelProportions(
          this.estatura ?? BASE_HEIGHT_CM,
          this.peso ?? BASE_WEIGHT_KG,
          this.complexion
        );
        this.applyPoseImmediate();
        this.animate();
      } catch (error) {
        console.error('No se pudo inicializar WebGL:', error);
      }
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationId);
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    this.disposeSceneResources();
    this.renderer?.dispose();

    this.skinMaterial.dispose();
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
    if (this.webglReady) {
      this.buildHuman();
    }
    this.syncModel();
  }

  // ---------- Validación biométrica ----------

  validarMedidas(): void {
    const errores: string[] = [];

    if (this.estatura !== null) {
      if (this.estatura < LIMITS.estatura.min || this.estatura > LIMITS.estatura.max) {
        errores.push(
          `La estatura debe estar entre ${LIMITS.estatura.min} cm y ${LIMITS.estatura.max} cm para el cálculo correcto de la malla.`
        );
      }
    }

    if (this.peso !== null) {
      if (this.peso < LIMITS.peso.min || this.peso > LIMITS.peso.max) {
        errores.push(
          `El peso debe estar entre ${LIMITS.peso.min} kg y ${LIMITS.peso.max} kg para el cálculo correcto de la malla.`
        );
      }
    }

    this.alertaValidacion = errores.length > 0 ? errores.join(' ') : null;
  }

  private syncModel(): void {
    if (!this.webglReady) {
      return;
    }
    this.updateModelProportions(
      this.estatura ?? BASE_HEIGHT_CM,
      this.peso ?? BASE_WEIGHT_KG,
      this.complexion
    );
  }

  // ---------- Motor paramétrico con clamping ----------

  updateModelProportions(estatura: number, peso: number, complexion: Complexion): void {
    // Clamping de entrada: aunque el usuario escriba 500 kg, el render nunca recibe ese valor
    const estaturaSegura = clamp(estatura, LIMITS.estatura.min, LIMITS.estatura.max);
    const pesoSeguro = clamp(peso, LIMITS.peso.min, LIMITS.peso.max);

    this.targetHeight = clamp(estaturaSegura / BASE_HEIGHT_CM, 0.75, 1.35);

    const weightRelation = pesoSeguro / estaturaSegura;
    const neutralRelation = BASE_WEIGHT_KG / BASE_HEIGHT_CM;
    const volumeScale = clamp(
      (weightRelation / neutralRelation) * COMPLEXION_WIDTH[complexion],
      0.72,
      1.6
    );

    // El incremento de volumen se reparte: 120% al torso, 50% a las extremidades
    this.targetMass.torso = clamp(
      1 + (volumeScale - 1) * TORSO_MASS_FACTOR,
      0.7,
      1.75
    );
    this.targetMass.limb = clamp(
      1 + (volumeScale - 1) * LIMB_MASS_FACTOR,
      0.85,
      1.3
    );

    this.updateFraming(this.targetHeight);
  }

  private applyPoseImmediate(): void {
    this.currentHeight = this.targetHeight;
    this.currentMass.torso = this.targetMass.torso;
    this.currentMass.limb = this.targetMass.limb;

    if (this.bodyGroup) {
      this.bodyGroup.scale.set(1, this.currentHeight, 1);
    }
    this.applyMass();
  }

  private applyMass(): void {
    if (!this.torsoGroup) {
      return;
    }

    this.torsoGroup.scale.set(this.currentMass.torso, 1, this.currentMass.torso);

    for (const anchor of this.armGroups) {
      anchor.group.scale.set(this.currentMass.limb, 1, this.currentMass.limb);
      anchor.group.position.x = anchor.baseX * this.currentMass.torso;
    }

    for (const anchor of this.legGroups) {
      anchor.group.scale.set(this.currentMass.limb, 1, this.currentMass.limb);
      anchor.group.position.x = anchor.baseX * this.currentMass.torso;
    }
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
    offset.setLength(3.05 * clamp(heightScale, 0.95, 1.35));
    this.camera.position.copy(this.controls.target).add(offset);
  }

  // ---------- Inicialización WebGL ----------

  private initThree(): void {
    const canvas = this.rendererCanvas.nativeElement;
    const host = canvas.parentElement ?? canvas;

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

    this.addLights();
    this.addStage();
    this.buildHuman();

    this.webglReady = true;
    this.updateSize(host);
    this.observeResize(host);
  }

  private addLights(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(3, 4.5, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 14;
    keyLight.shadow.camera.left = -2.5;
    keyLight.shadow.camera.right = 2.5;
    keyLight.shadow.camera.top = 3;
    keyLight.shadow.camera.bottom = -1;
    keyLight.shadow.bias = -0.0004;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9ad8ff, 0.9);
    fillLight.position.set(-3.5, 2.5, 3);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x22d3ee, 1.4);
    rimLight.position.set(-2, 3, -4);
    this.scene.add(rimLight);
  }

  private addStage(): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.ShadowMaterial({ opacity: 0.28 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.5, 64),
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.003;
    this.scene.add(ring);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.44, 64),
      new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide
      })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.002;
    this.scene.add(disc);

    const grid = new THREE.GridHelper(6, 24, 0x164e63, 0x0e3a47);
    const gridMaterial = grid.material as THREE.LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.25;
    this.scene.add(grid);
  }

  // ---------- Construcción humanoide orgánica ----------

  private buildHuman(): void {
    if (!this.rootGroup) {
      return;
    }

    if (this.bodyGroup) {
      this.rootGroup.remove(this.bodyGroup);
      this.disposeGeometries(this.bodyGroup);
    }

    this.armGroups = [];
    this.legGroups = [];

    const profile = GENDER_PROFILES[this.genero];
    const body = new THREE.Group();
    this.bodyGroup = body;

    this.buildTorso(body, profile);
    this.buildHead(body);
    this.buildArms(body, profile);
    this.buildLegs(body, profile);

    body.scale.set(1, this.currentHeight, 1);
    this.rootGroup.add(body);
  }

  private buildTorso(body: THREE.Group, profile: GenderProfile): void {
    const torso = new THREE.Group();
    this.torsoGroup = torso;
    body.add(torso);

    const hipRadius = profile.hipX * 1.15;
    const waistRadius = profile.waistR;
    const chestRadius = profile.chestR;
    const shoulderRadius = Math.max(chestRadius * 1.05, hipRadius * 0.92);

    // Silueta continua: una sola superficie de revolución en vez de cápsulas apiladas
    const skin = this.lathe(
      [
        [0.0, 0.78],
        [hipRadius * 0.62, 0.83],
        [hipRadius, 0.9],
        [hipRadius * 0.95, 0.99],
        [waistRadius, 1.11],
        [waistRadius * 1.12, 1.2],
        [chestRadius * 0.98, 1.29],
        [chestRadius, 1.4],
        [shoulderRadius, 1.47],
        [chestRadius * 0.62, 1.52],
        [0.0, 1.55]
      ],
      this.skinMaterial,
      0.72
    );
    torso.add(skin);

    // Ropa interior: tronco pélvico ajustado (sin volumen de pañal)
    const trunks = this.lathe(
      [
        [0.0, 0.78],
        [hipRadius * 0.63, 0.83],
        [hipRadius * 1.04, 0.9],
        [hipRadius * 0.99, 0.99],
        [hipRadius * 0.72, 1.04],
        [0.0, 1.05]
      ],
      this.underwearMaterial,
      0.74
    );
    torso.add(trunks);

    // Sujetador deportivo para el modelo femenino
    if (profile.bust) {
      const bra = this.lathe(
        [
          [0.0, 1.23],
          [chestRadius * 0.94, 1.26],
          [chestRadius * 1.07, 1.33],
          [chestRadius * 1.0, 1.41],
          [chestRadius * 0.5, 1.45],
          [0.0, 1.46]
        ],
        this.underwearMaterial,
        0.76
      );
      torso.add(bra);
    }
  }

  private buildHead(body: THREE.Group): void {
    const head = new THREE.Group();
    body.add(head);

    const neck = this.taperedCapsule(0.06, 0.05, 0.12, this.skinMaterial);
    neck.position.set(0, 1.51, 0);
    head.add(neck);

    const skull = new THREE.Mesh(
      new THREE.SphereGeometry(0.115, 32, 24),
      this.skinMaterial
    );
    skull.position.set(0, 1.67, 0);
    skull.scale.set(0.92, 1.12, 0.96);
    this.markShadow(skull);
    head.add(skull);

    // Nariz: referencia frontal para percibir la rotación
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 12, 10),
      this.skinMaterial
    );
    nose.position.set(0, 1.665, 0.108);
    nose.scale.set(0.8, 1.1, 1.2);
    this.markShadow(nose);
    head.add(nose);
  }

  private buildArms(body: THREE.Group, profile: GenderProfile): void {
    const shoulderY = 1.42;

    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * profile.shoulderX, shoulderY, 0);
      arm.rotation.z = side * 0.05;
      body.add(arm);

      // Brazo, antebrazo y mano: cápsulas cónicas con solape (sin esferas articulares)
      this.bone(arm, new THREE.Vector3(0, 0.04, 0), new THREE.Vector3(0, -0.22, 0), 0.062, 0.05, this.skinMaterial);
      this.bone(arm, new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0, -0.46, 0), 0.05, 0.04, this.skinMaterial);
      this.bone(arm, new THREE.Vector3(0, -0.44, 0), new THREE.Vector3(0, -0.55, 0), 0.042, 0.03, this.skinMaterial);

      this.armGroups.push({ group: arm, baseX: side * profile.shoulderX });
    }
  }

  private buildLegs(body: THREE.Group, profile: GenderProfile): void {
    const hipY = 0.87;

    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * profile.hipX, hipY, 0);
      body.add(leg);

      // Muslo superior = ropa interior; muslo inferior y pantorrilla = piel
      this.bone(leg, new THREE.Vector3(0, 0.04, 0), new THREE.Vector3(0, -0.2, 0), 0.088, 0.076, this.underwearMaterial);
      this.bone(leg, new THREE.Vector3(0, -0.16, 0), new THREE.Vector3(0, -0.4, 0), 0.076, 0.06, this.skinMaterial);
      this.bone(leg, new THREE.Vector3(0, -0.36, 0), new THREE.Vector3(0, -0.74, 0), 0.06, 0.042, this.skinMaterial);
      this.bone(leg, new THREE.Vector3(0, -0.76, 0), new THREE.Vector3(0, -0.79, 0.14), 0.045, 0.035, this.skinMaterial);

      this.legGroups.push({ group: leg, baseX: side * profile.hipX });
    }
  }

  // Superficie de revolución a partir de un perfil [radio, altura]
  private lathe(
    points: Array<[number, number]>,
    material: THREE.Material,
    scaleZ: number
  ): THREE.Mesh {
    const profile = points.map(([radius, height]) => new THREE.Vector2(radius, height));
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), material);
    mesh.scale.z = scaleZ;
    this.markShadow(mesh);
    return mesh;
  }

  // Cápsula cónica: extremos redondeados con radios distintos para fundir articulaciones
  private taperedCapsule(
    radiusBottom: number,
    radiusTop: number,
    length: number,
    material: THREE.Material
  ): THREE.Mesh {
    const half = Math.max(length, 0.01) / 2;
    const capSegments = 8;
    const profile: THREE.Vector2[] = [];

    for (let i = 0; i <= capSegments; i++) {
      const angle = -Math.PI / 2 + (Math.PI / 2) * (i / capSegments);
      profile.push(new THREE.Vector2(Math.cos(angle) * radiusBottom, -half + Math.sin(angle) * radiusBottom));
    }
    for (let i = 0; i <= capSegments; i++) {
      const angle = (Math.PI / 2) * (i / capSegments);
      profile.push(new THREE.Vector2(Math.cos(angle) * radiusTop, half + Math.sin(angle) * radiusTop));
    }

    const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 24), material);
    this.markShadow(mesh);
    return mesh;
  }

  // Segmento orientado entre dos puntos locales, con radio inicial y final
  private bone(
    group: THREE.Group,
    from: THREE.Vector3,
    to: THREE.Vector3,
    radiusFrom: number,
    radiusTo: number,
    material: THREE.Material
  ): THREE.Mesh {
    const direction = new THREE.Vector3().subVectors(to, from);
    const distance = direction.length();
    const mesh = this.taperedCapsule(radiusFrom, radiusTo, distance, material);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
    group.add(mesh);
    return mesh;
  }

  private markShadow(mesh: THREE.Mesh): void {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  // ---------- Loop de render ----------

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);

    this.currentHeight += (this.targetHeight - this.currentHeight) * 0.12;
    this.currentMass.torso += (this.targetMass.torso - this.currentMass.torso) * 0.12;
    this.currentMass.limb += (this.targetMass.limb - this.currentMass.limb) * 0.12;

    if (this.bodyGroup) {
      this.bodyGroup.scale.set(1, this.currentHeight, 1);
    }
    this.applyMass();

    const wireframe = this.isGenerating;
    if (this.skinMaterial.wireframe !== wireframe) {
      this.skinMaterial.wireframe = wireframe;
      this.underwearMaterial.wireframe = wireframe;
      this.skinMaterial.needsUpdate = true;
      this.underwearMaterial.needsUpdate = true;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  // ---------- Resize ----------

  private observeResize(host: HTMLElement): void {
    this.resizeObserver = new ResizeObserver(() => this.updateSize(host));
    this.resizeObserver.observe(host);
  }

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
      } else {
        material?.dispose();
      }
    });
  }

  // ---------- Flujo de generación (webhook) ----------

  generarModelo(): void {
    this.validarMedidas();

    if (this.alertaValidacion) {
      return;
    }

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
