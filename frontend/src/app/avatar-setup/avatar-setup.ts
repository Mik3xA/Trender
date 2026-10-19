import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewEncapsulation
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { environment } from '../../environments/environment';
import { AuthService, StoredSession } from '../servicios/auth.service';

const DEFAULT_CUSTOMER_EMAIL = 'usuario@trender.com';
const MEASUREMENTS_STORAGE_KEY = 'trender.measurements';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Complexion = 'Delgada' | 'Atlética' | 'Media' | 'Robusta';
export type Genero = 'Masculino' | 'Femenino';
type AuthMode = 'login' | 'registro';
type AuthAction = 'login' | 'registro';
type NotificationType = 'exito' | 'error';
type CategoriaPrenda = 'Torso' | 'Piernas';

interface Faq {
  pregunta: string;
  respuesta: string;
}

interface PrendaEscaneada {
  id: string;
  nombre: string;
  precio: string;
  categoria: CategoriaPrenda;
  imagenUrl: string;
}

const FAQS: Faq[] = [
  {
    pregunta: '¿Cómo calcula Trender las proporciones de mi avatar 3D?',
    respuesta:
      'Trender utiliza un motor gráfico paramétrico que convierte tus datos de estatura, peso y complexión en deformaciones geométricas reales sobre la malla 3D en tiempo real.'
  },
  {
    pregunta: '¿Cómo funciona el Escáner Web de Prendas?',
    respuesta:
      'Pega el enlace de cualquier producto de una tienda online. Nuestro motor analiza la URL, detecta la marca y extrae la imagen, nombre, precio y categoría de la prenda. Luego la texturiza sobre tu avatar 3D al instante.'
  }
];

const BASE_HEIGHT_CM = 170;
const BASE_WEIGHT_KG = 70;
const SCENE_SCALE = 100;

const NEUTRAL_GROSOR = BASE_WEIGHT_KG / Math.pow(BASE_HEIGHT_CM / 100, 2);

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
export class AvatarSetupComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('rendererCanvas', { static: true })
  private rendererCanvas!: ElementRef<HTMLCanvasElement>;

  estatura: number | null = null;
  peso: number | null = null;
  complexion: Complexion = 'Atlética';
  genero: Genero = 'Masculino';

  isGenerating = false;
  modelReady = false;
  alertaValidacion: string | null = null;
  modoInmersivo = false;

  mostrarModalAuth = false;
  modoAuth: AuthMode = 'login';
  emailIngresado = '';
  sesionIniciada = false;
  emailAutenticado = '';
  nombreAutenticado = '';
  errorAuth: string | null = null;
  cargandoAuth = false;
  nombreIngresado = '';
  passwordIngresado = '';
  registroExitoso = false;
  nombreRegistrado = '';
  notificacion: { mensaje: string; tipo: NotificationType } | null = null;
  tipoAccionAuth: AuthAction | '' = '';

  // Escáner Web de Prendas
  urlEscaneo = '';
  escaneando = false;
  prendaEscaneada: PrendaEscaneada | null = null;
  errorEscaneo: string | null = null;

  readonly faqs: Faq[] = FAQS;
  faqAbierto: number | null = null;

  readonly marqueeItems: MarqueeItem[] = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];

  prendaActiva: PrendaEscaneada | null = null;

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
  private notificacionTimer?: ReturnType<typeof setTimeout>;
  private registroTimer?: ReturnType<typeof setTimeout>;
  private layoutTimer?: ReturnType<typeof setTimeout>;
  private registroEnCurso = false;
  private authSubscription?: Subscription;
  private garmentMeshes: THREE.Mesh[] = [];
  private garmentTexture?: THREE.Texture;
  private garmentMaterial?: THREE.MeshStandardMaterial;
  private readonly textureLoader = new THREE.TextureLoader();

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

  private readonly mannequinMaterial = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.55,
    metalness: 0.05
  });

  private readonly underwearMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d3728,
    roughness: 0.7,
    metalness: 0.05
  });

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    this.cargarEstadoPersistido();
    this.authSubscription = this.auth.sesion$.subscribe((sesion) => {
      this.aplicarSesion(sesion);
      this.cdr.detectChanges();
    });
    this.auth.refrescarSesion();
  }

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

    this.layoutTimer = setTimeout(() => {
      if (!this.webglReady) {
        return;
      }
      const host = this.viewport ?? this.rendererCanvas?.nativeElement.parentElement;
      this.updateModelProportions(
        this.estatura ?? BASE_HEIGHT_CM,
        this.peso ?? BASE_WEIGHT_KG,
        this.complexion,
        this.genero
      );
      if (host) {
        this.updateSize(host);
      }
      this.updateFraming(this.target.height);
    }, 100);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationId);
    this.authSubscription?.unsubscribe();
    this.desbloquearScroll();
    if (this.notificacionTimer) {
      clearTimeout(this.notificacionTimer);
    }
    if (this.registroTimer) {
      clearTimeout(this.registroTimer);
    }
    if (this.layoutTimer) {
      clearTimeout(this.layoutTimer);
    }
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    this.controls?.dispose();
    this.limpiarRopa();
    this.disposeSceneResources();
    this.renderer?.dispose();
    this.mannequinMaterial.dispose();
    this.underwearMaterial.dispose();
  }

  onEstaturaChange(value: number | null): void {
    this.estatura = value;
    this.validarMedidas();
    this.syncModel();
    this.guardarMedidas();
  }

  onPesoChange(value: number | null): void {
    this.peso = value;
    this.validarMedidas();
    this.syncModel();
    this.guardarMedidas();
  }

  onComplexionChange(value: Complexion): void {
    this.complexion = value;
    this.syncModel();
    this.guardarMedidas();
  }

  onGeneroChange(value: Genero): void {
    this.genero = value;
    this.buildMannequin();
    this.syncModel();
    this.guardarMedidas();
  }

  get tituloAuth(): string {
    return this.modoAuth === 'registro' ? 'Crea tu cuenta' : 'Inicia sesión';
  }

  get descripcionAuth(): string {
    return 'Accede a tu cuenta para guardar tus medidas y preferencias.';
  }

  abrirAuthModal(accion: AuthAction): void {
    this.tipoAccionAuth = accion;
    this.modoAuth = accion === 'registro' ? 'registro' : 'login';
    this.mostrarModalAuth = true;
    this.errorAuth = null;
    this.cargandoAuth = false;
    this.passwordIngresado = '';
    this.nombreIngresado = '';
    this.registroExitoso = false;
    this.registroEnCurso = false;
  }

  cerrarModalAuth(): void {
    if (this.registroExitoso) {
      return;
    }

    if (this.registroTimer) {
      clearTimeout(this.registroTimer);
      this.registroTimer = undefined;
    }

    this.mostrarModalAuth = false;
    this.tipoAccionAuth = '';
    this.errorAuth = null;
    this.cargandoAuth = false;
    this.passwordIngresado = '';
    this.registroExitoso = false;
    this.nombreRegistrado = '';
    this.registroEnCurso = false;
  }

  @HostListener('document:keydown.escape')
  cerrarConEscape(): void {
    if (this.mostrarModalAuth) {
      this.cerrarModalAuth();
    }
  }

  cambiarModoAuth(modo: AuthMode): void {
    this.modoAuth = modo;
    this.errorAuth = null;
    this.passwordIngresado = '';
    this.nombreIngresado = '';
  }

  registrarConPassword(): void {
    if (this.cargandoAuth) {
      return;
    }

    const email = this.emailIngresado.trim();
    const nombre = this.nombreIngresado.trim();

    if (!nombre) {
      this.errorAuth = 'Ingresa tu nombre.';
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      this.errorAuth = 'Ingresa un correo electrónico válido.';
      return;
    }

    if (this.passwordIngresado.length < 8) {
      this.errorAuth = 'La contraseña debe tener al menos 8 caracteres.';
      return;
    }

    this.emailIngresado = email;
    this.errorAuth = null;
    this.cargandoAuth = true;
    this.registroEnCurso = true;

    this.auth
      .registrar({
        nombre,
        email,
        password: this.passwordIngresado
      })
      .subscribe({
        next: () => {
          this.cargandoAuth = false;
          this.mostrarExitoRegistro(nombre);
          this.cdr.detectChanges();
        },
        error: (error: HttpErrorResponse) => {
          this.cargandoAuth = false;
          this.registroEnCurso = false;
          this.errorAuth = this.mensajeError(error, 'No se pudo crear la cuenta.');
          this.cdr.detectChanges();
        }
      });
  }

  private mostrarExitoRegistro(nombreIngresado: string): void {
    const nombre = this.auth.sesionActual?.user?.nombre?.trim() || nombreIngresado;
    this.nombreRegistrado = nombre;
    this.registroExitoso = true;

    this.registroTimer = setTimeout(() => {
      this.registroTimer = undefined;
      this.finalizarSesion();
      this.cargarDatosUsuario();
      this.cdr.detectChanges();
    }, 2000);
  }

  iniciarSesionConPassword(): void {
    if (this.cargandoAuth) {
      return;
    }

    const email = this.emailIngresado.trim();

    if (!EMAIL_REGEX.test(email) || !this.passwordIngresado) {
      this.errorAuth = 'Ingresa tu correo y contraseña.';
      return;
    }

    this.emailIngresado = email;
    this.errorAuth = null;
    this.cargandoAuth = true;

    this.auth
      .iniciarSesion({ email, password: this.passwordIngresado })
      .subscribe({
        next: () => {
          this.cargandoAuth = false;
          this.finalizarSesion();
          this.cargarDatosUsuario();
          this.cdr.detectChanges();
        },
        error: (error: HttpErrorResponse) => {
          this.cargandoAuth = false;
          this.errorAuth =
            error.status === 401
              ? 'Credenciales inválidas. Revisa tu correo y contraseña.'
              : this.mensajeError(error, 'No se pudo iniciar sesión.');
          this.cdr.detectChanges();
        }
      });
  }

  private cargarDatosUsuario(): void {
    const token = this.auth.obtenerToken();
    if (!token) return;

    this.http
      .get<{ status: string; medidas: any }>(
        `${environment.apiUrl}/api/medidas/medidas`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .subscribe({
        next: (res) => {
          if (res.medidas) {
            this.aplicarMedidasBackend(res.medidas);
          }
        },
        error: () => {
        }
      });
  }

  private aplicarMedidasBackend(medidas: { estatura?: number; peso?: number; complexion?: Complexion; genero?: Genero }): void {
    if (medidas.estatura) this.estatura = medidas.estatura;
    if (medidas.peso) this.peso = medidas.peso;
    if (medidas.complexion) this.complexion = medidas.complexion;
    if (medidas.genero) this.genero = medidas.genero;
    this.validarMedidas();
    this.syncModel();
    this.guardarMedidas();
  }

  private guardarMedidasBackend(): void {
    const token = this.auth.obtenerToken();
    if (!token) return;

    this.http
      .post(
        `${environment.apiUrl}/api/medidas/medidas`,
        { estatura: this.estatura, peso: this.peso, complexion: this.complexion, genero: this.genero },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .subscribe({ error: () => {} });
  }

  escanearProducto(): void {
    const url = this.urlEscaneo.trim();
    if (!url) {
      this.errorEscaneo = 'Ingresa una URL válida.';
      return;
    }

    this.escaneando = true;
    this.errorEscaneo = null;
    this.prendaEscaneada = null;

    this.http
      .post<{ success: boolean; prenda: PrendaEscaneada }>(
        `${environment.apiUrl}/api/ropa/escanear-link`,
        { url }
      )
      .subscribe({
        next: (res) => {
          if (res.success && res.prenda) {
            this.prendaEscaneada = res.prenda;
          } else {
            this.errorEscaneo = 'No se pudo escanear la prenda. Intenta con otra URL.';
          }
          this.escaneando = false;
          this.cdr.detectChanges();
        },
        error: (err: HttpErrorResponse) => {
          this.escaneando = false;
          this.errorEscaneo = err.error?.message || 'Error al escanear. Verifica la URL e intenta de nuevo.';
          this.cdr.detectChanges();
        }
      });
  }

  probarPrendaEscaneada(): void {
    if (this.prendaEscaneada) {
      this.probarPrenda(this.prendaEscaneada);
    }
  }

  limpiarEscaneo(): void {
    this.urlEscaneo = '';
    this.prendaEscaneada = null;
    this.errorEscaneo = null;
  }

  cerrarSesion(): void {
    this.auth.cerrarSesion();
    this.emailAutenticado = '';
    this.nombreAutenticado = '';
    this.emailIngresado = '';
    this.reiniciarEstadoDemo();
    this.mostrarNotificacion('Sesión cerrada. Medidas reiniciadas.', 'exito');
  }

  private reiniciarEstadoDemo(): void {
    const storage = this.getStorage();
    storage?.removeItem(MEASUREMENTS_STORAGE_KEY);

    this.estatura = null;
    this.peso = null;
    this.complexion = 'Atlética';
    this.genero = 'Masculino';
    this.alertaValidacion = null;
    this.modelReady = false;
    this.prendaActiva = null;
    this.limpiarRopa();

    if (this.modoInmersivo) {
      this.modoInmersivo = false;
      this.desbloquearScroll();
    }

    if (this.webglReady) {
      this.updateModelProportions(
        BASE_HEIGHT_CM,
        BASE_WEIGHT_KG,
        this.complexion,
        this.genero
      );
      this.buildMannequin();
    }
  }

  private finalizarSesion(): void {
    const sesion = this.auth.sesionActual;

    this.registroEnCurso = false;
    this.sesionIniciada = true;
    this.emailAutenticado = sesion?.email ?? this.emailIngresado;
    this.nombreAutenticado =
      sesion?.user?.nombre?.trim() || this.nombreDesdeEmail(this.emailAutenticado);
    this.emailIngresado = this.emailAutenticado;
    this.mostrarModalAuth = false;
    this.errorAuth = null;
    this.tipoAccionAuth = '';
    this.passwordIngresado = '';
    this.nombreIngresado = '';
    this.registroExitoso = false;
    this.nombreRegistrado = '';

    this.mostrarNotificacion(`Bienvenido/a, ${this.nombreAutenticado}.`, 'exito');
  }

  private aplicarSesion(sesion: StoredSession | null): void {
    if (this.registroEnCurso) {
      return;
    }

    this.sesionIniciada = Boolean(sesion?.sesionIniciada);
    this.emailAutenticado = sesion?.email ?? '';
    this.nombreAutenticado =
      sesion?.user?.nombre?.trim() || this.nombreDesdeEmail(this.emailAutenticado);

    if (sesion?.email) {
      this.emailIngresado = sesion.email;
    } else {
      this.emailIngresado = '';
      this.nombreAutenticado = '';
    }
  }

  private nombreDesdeEmail(email: string): string {
    const base = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim() ?? '';
    if (!base) {
      return 'Usuario Trender';
    }

    return base
      .split(' ')
      .filter(Boolean)
      .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
      .join(' ');
  }

  private mensajeError(error: HttpErrorResponse, fallback: string): string {
    if (error.status === 0) {
      return 'No se pudo conectar con el servidor. Verifica que el backend esté activo.';
    }

    return error.error?.message ?? error.error?.error ?? fallback;
  }

  probarPrenda(prenda: PrendaEscaneada): void {
    this.prendaActiva = prenda;
    this.scrollToVisor();

    if (this.webglReady && this.modelGroup) {
      this.aplicarPrendaVirtual(prenda);
    }

    this.mostrarNotificacion(
      `Probando: ${prenda.nombre}`,
      'exito'
    );
  }

  quitarRopa(): void {
    this.limpiarRopa();
    this.prendaActiva = null;
    this.mostrarNotificacion('Prenda retirada. Maniquí restaurado.', 'exito');
  }

  private aplicarPrendaVirtual(prenda: PrendaEscaneada): void {
    this.limpiarRopa();

    if (!this.modelGroup) {
      return;
    }

    const colorFallback = prenda.categoria === 'Torso' ? 0x3f4e3b : 0x2d3728;

    this.garmentMaterial = new THREE.MeshStandardMaterial({
      color: colorFallback,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    this.textureLoader.load(
      prenda.imagenUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        this.garmentTexture = texture;
        if (this.garmentMaterial) {
          this.garmentMaterial.map = texture;
          this.garmentMaterial.needsUpdate = true;
        }
      },
      undefined,
      (err) => {
        console.warn('No se pudo cargar la textura de la prenda, usando color de respaldo:', err);
      }
    );

    const escala = prenda.categoria === 'Torso' ? 1.08 : 1.1;

    for (const parte of this.partesParaPrenda(prenda)) {
      const cuerpo = this.modelGroup.getObjectByName(parte) as THREE.Mesh | undefined;
      if (!cuerpo) {
        continue;
      }

      const capa = new THREE.Mesh(cuerpo.geometry.clone(), this.garmentMaterial);
      capa.name = `${parte}_ropa`;
      capa.scale.setScalar(escala);
      capa.castShadow = true;
      capa.receiveShadow = true;
      cuerpo.add(capa);
      this.garmentMeshes.push(capa);
    }
  }

  private partesParaPrenda(prenda: PrendaEscaneada): string[] {
    const esTorso = prenda.categoria === 'Torso';
    const esLargo = /vestido|abrigo|trench/i.test(prenda.nombre);
    const partes = new Set<string>();

    if (esTorso || esLargo) {
      for (const parte of this.partesTorsoRopa()) {
        partes.add(parte);
      }
    }

    if (!esTorso || esLargo) {
      for (const parte of this.partesPiernasRopa()) {
        partes.add(parte);
      }
    }

    return [...partes];
  }

  private limpiarRopa(): void {
    for (const capa of this.garmentMeshes) {
      capa.parent?.remove(capa);
      capa.geometry.dispose();
    }

    this.garmentMeshes = [];
    this.garmentMaterial?.dispose();
    this.garmentMaterial = undefined;
    if (this.garmentTexture) {
      this.garmentTexture.dispose();
      this.garmentTexture = undefined;
    }
  }

  private partesTorsoRopa(): string[] {
    return [
      'torso',
      'busto_izq',
      'busto_der',
      'hombro_izq',
      'hombro_der',
      'brazo_izq',
      'brazo_der',
      'antebrazo_izq',
      'antebrazo_der'
    ];
  }

  private partesPiernasRopa(): string[] {
    return ['pelvis', 'muslo_izq', 'muslo_der', 'pantorrilla_izq', 'pantorrilla_der'];
  }

  activarModoInmersivo(): void {
    if (this.modoInmersivo) {
      return;
    }
    this.modoInmersivo = true;
    this.bloquearScroll();
    this.cdr.detectChanges();
    setTimeout(() => this.reajustarVisor());
  }

  salirModoInmersivo(): void {
    if (!this.modoInmersivo) {
      return;
    }
    this.modoInmersivo = false;
    this.desbloquearScroll();
    this.cdr.detectChanges();
    setTimeout(() => this.reajustarVisor());
    this.scrollToProbador();
  }

  private bloquearScroll(): void {
    if (typeof document !== 'undefined') {
      document.body.classList.add('overflow-hidden');
    }
  }

  private desbloquearScroll(): void {
    if (typeof document !== 'undefined') {
      document.body.classList.remove('overflow-hidden');
    }
  }

  private scrollToProbador(): void {
    const seccion = document.getElementById('probador-section');
    seccion?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  private scrollToVisor(): void {
    this.rendererCanvas?.nativeElement?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start'
    });
  }

  toggleFaq(index: number): void {
    this.faqAbierto = this.faqAbierto === index ? null : index;
  }

  mostrarNotificacion(mensaje: string, tipo: NotificationType): void {
    if (this.notificacionTimer) {
      clearTimeout(this.notificacionTimer);
    }
    this.notificacion = { mensaje, tipo };
    this.notificacionTimer = setTimeout(() => {
      this.notificacion = null;
      this.cdr.detectChanges();
    }, 4000);
  }

  cerrarNotificacion(): void {
    if (this.notificacionTimer) {
      clearTimeout(this.notificacionTimer);
    }
    this.notificacion = null;
  }

  private getStorage(): Storage | null {
    try {
      return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
    } catch {
      return null;
    }
  }

  private cargarEstadoPersistido(): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    try {
      const medidasRaw = storage.getItem(MEASUREMENTS_STORAGE_KEY);
      if (medidasRaw) {
        const medidas = JSON.parse(medidasRaw) as {
          estatura?: unknown;
          peso?: unknown;
          complexion?: unknown;
          genero?: unknown;
        };

        if (typeof medidas.estatura === 'number' && medidas.estatura > 0) {
          this.estatura = medidas.estatura;
        }
        if (typeof medidas.peso === 'number' && medidas.peso > 0) {
          this.peso = medidas.peso;
        }
        if (
          medidas.complexion === 'Delgada' ||
          medidas.complexion === 'Atlética' ||
          medidas.complexion === 'Media' ||
          medidas.complexion === 'Robusta'
        ) {
          this.complexion = medidas.complexion;
        }
        if (medidas.genero === 'Masculino' || medidas.genero === 'Femenino') {
          this.genero = medidas.genero;
        }
      }
    } catch {
      storage.removeItem(MEASUREMENTS_STORAGE_KEY);
    }
  }

  private guardarMedidas(): void {
    this.guardarEnStorage(
      MEASUREMENTS_STORAGE_KEY,
      JSON.stringify({
        estatura: this.estatura,
        peso: this.peso,
        complexion: this.complexion,
        genero: this.genero
      })
    );
    this.guardarMedidasBackend();
  }

  private guardarEnStorage(clave: string, valor: string): void {
    try {
      this.getStorage()?.setItem(clave, valor);
    } catch {
    }
  }

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

  updateModelProportions(
    estatura: number,
    peso: number,
    complexion: Complexion,
    genero: Genero
  ): void {
    const estaturaSafe = clamp(estatura, LIMITS.estatura.min, LIMITS.estatura.max);
    const pesoSafe = clamp(peso, LIMITS.peso.min, LIMITS.peso.max);

    const estaturaM = estaturaSafe / 100;
    const factorGrosor = pesoSafe / (estaturaM * estaturaM);
    const grosor = clamp(factorGrosor / NEUTRAL_GROSOR, 0.55, 2.4);

    const profile = COMPLEXION_PROFILE[complexion];
    const shoulderGender = GENDER_SHOULDER[genero];

    this.target.height = clamp(estaturaSafe / BASE_HEIGHT_CM, 0.4, 1.6);

    this.target.torsoXZ = clamp(profile.torsoXZ * (0.8 + 0.2 * grosor), 0.7, 1.9);
    this.target.pelvisXZ = clamp(profile.pelvisXZ * (0.8 + 0.2 * grosor), 0.7, 1.9);

    this.target.shoulderX = clamp(
      profile.shoulderX * shoulderGender * (0.9 + 0.1 * grosor),
      0.7,
      1.7
    );

    this.target.armXZ = clamp(profile.armXZ * grosor, 0.7, 2.2);
    this.target.legXZ = clamp(profile.legXZ * grosor, 0.7, 2.2);

    this.updateFraming(this.target.height);
  }

  private updateFraming(heightScale: number): void {
    if (!this.controls || !this.camera) {
      return;
    }

    const targetY = 90 * heightScale;
    const deltaY = targetY - this.controls.target.y;
    this.controls.target.y = targetY;
    this.camera.position.y += deltaY;

    const offset = new THREE.Vector3().subVectors(
      this.camera.position,
      this.controls.target
    );
    offset.setLength(250 * clamp(heightScale, 0.55, 1.5));
    this.camera.position.copy(this.controls.target).add(offset);
  }

  private initThree(): void {
    const canvas = this.rendererCanvas.nativeElement;
    const host = canvas.parentElement ?? canvas;
    this.viewport = host;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 3000);
    this.camera.position.set(0, 120, 250);

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
    this.controls.target.set(0, 90, 0);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.rotateSpeed = 0.8;
    this.controls.minPolarAngle = Math.PI * 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.86;

    this.rootGroup = new THREE.Group();
    this.rootGroup.scale.setScalar(SCENE_SCALE);
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
    this.scene.add(new THREE.AmbientLight(0xfff4e6, 1.05));

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.35);
    keyLight.position.set(400, 700, 400);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 2000;
    keyLight.shadow.camera.left = -300;
    keyLight.shadow.camera.right = 300;
    keyLight.shadow.camera.top = 500;
    keyLight.shadow.camera.bottom = -200;
    keyLight.shadow.bias = -0.0004;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xf5f0e6, 0.4);
    fillLight.position.set(-400, 300, -200);
    this.scene.add(fillLight);
  }

  private addStage(): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.ShadowMaterial({ opacity: 0.15 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  private buildMannequin(): void {
    if (!this.modelGroup) {
      return;
    }

    this.limpiarRopa();

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

    if (this.prendaActiva) {
      this.aplicarPrendaVirtual(this.prendaActiva);
    }
  }

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

    group.add(this.part(new THREE.CylinderGeometry(0.155, 0.115, 0.4, 28), 'torso', 0, 1.2, 0));
    group.add(this.part(new THREE.CylinderGeometry(0.15, 0.135, 0.16, 24), 'pelvis', 0, 0.92, 0));
    this.addUnderwear(group, 0.17);

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

  private applyRig(): void {
    const t = this.current;

    if (this.modelGroup) {
      this.modelGroup.scale.y = t.height;
    }

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

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const delta = Math.min((now - this.lastFrameTime) / 1000 || 0, 0.1);
    this.lastFrameTime = now;

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

    const width = this.modoInmersivo ? window.innerWidth : host.clientWidth || 1;
    const height = this.modoInmersivo ? window.innerHeight : host.clientHeight || 1;

    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private reajustarVisor(): void {
    const host = this.viewport ?? this.rendererCanvas?.nativeElement.parentElement;
    if (host) {
      this.updateSize(host);
    }
    this.updateFraming(this.target.height);
  }

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

  generarModelo(): void {
    this.validarMedidas();

    if (!this.estatura || !this.peso) {
      this.mostrarNotificacion('Ingresa estatura y peso para generar tu avatar.', 'error');
      return;
    }

    this.isGenerating = true;
    this.modelReady = false;
    this.activarModoInmersivo();

    const payload = {
      transaction_id: crypto.randomUUID(),
      amount: 100,
      customer_email: this.emailAutenticado || DEFAULT_CUSTOMER_EMAIL,
      currency: 'USD',
      avatar_data: {
        estatura: this.estatura,
        peso: this.peso,
        complexion: this.complexion,
        genero: this.genero
      }
    };

    this.http.post(`${environment.apiUrl}/webhooks/recibir`, payload).subscribe({
      next: (respuesta) => {
        console.log('Webhook procesado en backend:', respuesta);
        this.isGenerating = false;
        this.modelReady = true;
        this.mostrarNotificacion('Modelo 3D generado con éxito.', 'exito');
        if (!this.modoInmersivo) {
          this.scrollToVisor();
        }
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
        this.mostrarNotificacion(
          err.status === 400
            ? 'Revisa tus medidas: el backend rechazó los datos del avatar.'
            : 'No se pudo procesar el modelo 3D. Intenta nuevamente.',
          'error'
        );
        this.cdr.detectChanges();
      }
    });
  }
}