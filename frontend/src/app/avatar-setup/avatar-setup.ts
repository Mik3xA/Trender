import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren,
  ViewEncapsulation
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { environment } from '../../environments/environment';
import { AuthService, StoredSession } from '../servicios/auth.service';
import {
  CATALOGOS,
  Prenda,
  TIENDA_CATALOGO_INICIAL,
  TiendaCatalogo
} from '../data/catalogos.data';

const DEFAULT_CUSTOMER_EMAIL = 'usuario@trender.com';
const STORES_STORAGE_KEY = 'trender.stores';
const MEASUREMENTS_STORAGE_KEY = 'trender.measurements';
const EXPORTED_MODELS_STORAGE_KEY = 'trender.models.exported';
const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Complexion = 'Delgada' | 'Atlética' | 'Media' | 'Robusta';
export type Genero = 'Masculino' | 'Femenino';
type AuthMode = 'login' | 'registro' | 'codigo' | 'password-login' | 'password-registro';
type AuthAction = 'login' | 'registro' | 'escaneo' | 'prenda';
type NotificationType = 'exito' | 'error';

interface Tienda {
  nombre: string;
  monograma: string;
  vinculada: boolean;
}

interface Faq {
  pregunta: string;
  respuesta: string;
}

const TIENDAS: Tienda[] = [
  { nombre: 'Shein', monograma: 'SH', vinculada: false },
  { nombre: 'El Palacio de Hierro', monograma: 'PH', vinculada: false },
  { nombre: 'Adidas', monograma: 'AD', vinculada: false },
  { nombre: 'Studio F', monograma: 'SF', vinculada: false },
  { nombre: 'Amazon Fashion', monograma: 'AF', vinculada: false },
  { nombre: 'Zara', monograma: 'ZA', vinculada: false },
  { nombre: 'H&M', monograma: 'H&M', vinculada: false },
  { nombre: 'C&A Moda', monograma: 'C&A', vinculada: false },
  { nombre: 'AliExpress', monograma: 'AE', vinculada: false },
  { nombre: 'Bershka & Nike', monograma: 'B&N', vinculada: false }
];

const FAQS: Faq[] = [
  {
    pregunta: '¿Cómo calcula Trender las proporciones de mi avatar 3D?',
    respuesta:
      'Trender utiliza un motor gráfico paramétrico que convierte tus datos de estatura, peso y complexión en deformaciones geométricas reales sobre la malla 3D en tiempo real.'
  },
  {
    pregunta: '¿Es seguro el escaneo de mi cuerpo con el Motor Biométrico Local?',
    respuesta:
      'Totalmente seguro. Las imágenes procesadas para la fotogrametría 3D no se almacenan en servidores públicos; se procesan de forma cifrada para generar únicamente los puntos de medición biométrica.'
  },
  {
    pregunta: '¿Cómo funciona la sincronización con tiendas como Zara, Shein o Adidas?',
    respuesta:
      'Una vez vinculada tu cuenta, Trender mapea el tallaje oficial de cada marca con las medidas exactas de tu avatar 3D, mostrándote el porcentaje de ajuste y holgura de cada prenda.'
  },
  {
    pregunta: '¿Puedo exportar mi modelo 3D a otras plataformas?',
    respuesta:
      'Sí, los usuarios registrados pueden exportar su avatar en formato .GLB estandarizado para usarlo en otras herramientas de modelado o metaverso.'
  }
];

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
export class AvatarSetupComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('rendererCanvas', { static: true })
  private rendererCanvas!: ElementRef<HTMLCanvasElement>;

  @ViewChildren('otpInput')
  private otpInputs?: QueryList<ElementRef<HTMLInputElement>>;

  estatura: number | null = null;
  peso: number | null = null;
  complexion: Complexion = 'Atlética';
  genero: Genero = 'Masculino';

  isGenerating = false;
  modelReady = false;
  alertaValidacion: string | null = null;

  // Autenticación real contra /api/auth
  mostrarModalAuth = false;
  modoAuth: AuthMode = 'login';
  emailIngresado = '';
  codigoEnviado = false;
  codigoVerificacion = '';
  sesionIniciada = false;
  emailAutenticado = '';
  nombreAutenticado = '';
  reenvioSegundos = 0;
  errorAuth: string | null = null;
  errorCodigo: string | null = null;
  cargandoAuth = false;
  nombreIngresado = '';
  passwordIngresado = '';
  passwordConfirmacion = '';
  registroExitoso = false;
  nombreRegistrado = '';
  redirigiendoTienda: string | null = null;
  notificacion: { mensaje: string; tipo: NotificationType } | null = null;
  tipoAccionAuth: AuthAction | '' = '';
  prendaPendiente: Prenda | null = null;
  prendaSeleccionada: Prenda | null = null;

  tiendas: Tienda[] = TIENDAS.map((tienda) => ({ ...tienda }));

  get tiendasVinculadasCount(): number {
    return this.tiendas.filter((tienda) => tienda.vinculada).length;
  }

  readonly faqs: Faq[] = FAQS;
  faqAbierto: number | null = null;

  readonly marqueeItems: MarqueeItem[] = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  readonly catalogos: TiendaCatalogo[] = CATALOGOS;
  tiendaCatalogoActiva: string = TIENDA_CATALOGO_INICIAL.id;

  modelosExportados = 0;
  exportandoModelo = false;

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
  private reenvioTimer?: ReturnType<typeof setInterval>;
  private notificacionTimer?: ReturnType<typeof setTimeout>;
  private registroTimer?: ReturnType<typeof setTimeout>;
  private redireccionTimer?: ReturnType<typeof setTimeout>;
  private registroEnCurso = false;
  private authSubscription?: Subscription;

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
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationId);
    this.authSubscription?.unsubscribe();
    this.detenerReenvio();
    if (this.notificacionTimer) {
      clearTimeout(this.notificacionTimer);
    }
    if (this.registroTimer) {
      clearTimeout(this.registroTimer);
    }
    if (this.redireccionTimer) {
      clearTimeout(this.redireccionTimer);
    }
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

  // ---------- Autenticación ----------

  get tituloAuth(): string {
    if (this.tipoAccionAuth === 'escaneo') {
      return 'Desbloquea el Motor Biométrico Local';
    }
    if (this.tipoAccionAuth === 'prenda') {
      return this.prendaPendiente
        ? `Prueba ${this.prendaPendiente.nombre} en tu avatar`
        : 'Prueba esta prenda en tu avatar';
    }
    if (this.modoAuth === 'password-registro') {
      return 'Crea tu cuenta clásica';
    }
    if (this.modoAuth === 'password-login') {
      return 'Inicia sesión con contraseña';
    }
    return this.modoAuth === 'registro' ? 'Crea tu cuenta' : 'Inicia sesión';
  }

  get descripcionAuth(): string {
    if (this.tipoAccionAuth === 'escaneo') {
      return 'El escaneo biométrico procesa tus medidas personales y requiere una cuenta para cifrarlas y mantenerlas privadas.';
    }
    if (this.tipoAccionAuth === 'prenda') {
      return 'Inicia sesión para probar esta prenda sobre tu avatar y guardar tus selecciones.';
    }
    return 'Accede a tu cuenta para guardar tu avatar y sincronizar tus tiendas favoritas.';
  }

  abrirAuthModal(accion: AuthAction): void {
    this.tipoAccionAuth = accion;
    if (accion !== 'prenda') {
      this.prendaPendiente = null;
    }
    this.modoAuth = accion === 'registro' ? 'registro' : 'login';
    this.mostrarModalAuth = true;
    this.codigoEnviado = false;
    this.codigoVerificacion = '';
    this.errorAuth = null;
    this.errorCodigo = null;
    this.cargandoAuth = false;
    this.passwordIngresado = '';
    this.passwordConfirmacion = '';
    this.nombreIngresado = '';
    this.registroExitoso = false;
    this.registroEnCurso = false;
    this.detenerReenvio();
    this.reenvioSegundos = 0;
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
    this.prendaPendiente = null;
    this.codigoEnviado = false;
    this.codigoVerificacion = '';
    this.errorAuth = null;
    this.errorCodigo = null;
    this.cargandoAuth = false;
    this.passwordIngresado = '';
    this.passwordConfirmacion = '';
    this.registroExitoso = false;
    this.nombreRegistrado = '';
    this.registroEnCurso = false;
    this.detenerReenvio();
    this.reenvioSegundos = 0;
  }

  @HostListener('document:keydown.escape')
  cerrarConEscape(): void {
    if (this.mostrarModalAuth) {
      this.cerrarModalAuth();
    }
  }

  cambiarModoAuth(modo: AuthMode): void {
    this.modoAuth = modo;
    this.codigoEnviado = modo === 'codigo';
    this.codigoVerificacion = '';
    this.errorAuth = null;
    this.errorCodigo = null;
    this.passwordIngresado = '';
    this.passwordConfirmacion = '';
    if (modo !== 'codigo') {
      this.detenerReenvio();
      this.reenvioSegundos = 0;
    }
  }

  irAPasswordRegistro(): void {
    this.cambiarModoAuth('password-registro');
  }

  irAPasswordLogin(): void {
    this.cambiarModoAuth('password-login');
  }

  volverACodigo(): void {
    this.cambiarModoAuth(this.tipoAccionAuth === 'registro' ? 'registro' : 'login');
  }

  enviarCodigo(): void {
    this.solicitarCodigo(false);
  }

  reenviarCodigo(): void {
    if (this.reenvioSegundos > 0 || this.cargandoAuth) {
      return;
    }
    this.codigoVerificacion = '';
    this.errorCodigo = null;
    this.solicitarCodigo(true);
  }

  cambiarCorreo(): void {
    this.modoAuth = this.tipoAccionAuth === 'registro' ? 'registro' : 'login';
    this.codigoEnviado = false;
    this.codigoVerificacion = '';
    this.errorCodigo = null;
    this.errorAuth = null;
    this.detenerReenvio();
    this.reenvioSegundos = 0;
  }

  private solicitarCodigo(esReenvio: boolean): void {
    const email = this.emailIngresado.trim();

    if (!EMAIL_REGEX.test(email)) {
      this.errorAuth = 'Ingresa un correo electrónico válido.';
      return;
    }

    this.emailIngresado = email;
    this.errorAuth = null;
    this.errorCodigo = null;
    this.cargandoAuth = true;

    this.auth.solicitarCodigo(email).subscribe({
      next: () => {
        this.cargandoAuth = false;
        this.modoAuth = 'codigo';
        this.codigoEnviado = true;
        this.codigoVerificacion = '';
        this.iniciarReenvio();
        this.mostrarNotificacion(
          esReenvio
            ? `Código reenviado a ${email}.`
            : `Código de verificación enviado a ${email}.`,
          'exito'
        );
        this.enfocarOtp(0);
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.cargandoAuth = false;
        this.errorAuth = this.mensajeError(
          error,
          'No se pudo enviar el código. Intenta nuevamente.'
        );
        this.cdr.detectChanges();
      }
    });
  }

  digitoCodigo(index: number): string {
    return this.codigoVerificacion.padEnd(OTP_LENGTH, ' ').charAt(index).trim();
  }

  onCodigoInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const digits = this.codigoVerificacion.padEnd(OTP_LENGTH, ' ').split('');
    digits[index] = input.value.replace(/\D/g, '').slice(-1);
    this.codigoVerificacion = digits.join('');
    input.value = digits[index].trim();
    this.errorCodigo = null;

    if (digits[index].trim() && index < OTP_LENGTH - 1) {
      this.enfocarOtp(index + 1);
    }

    if (this.codigoCompleto()) {
      this.verificarCodigo();
    }
  }

  onCodigoKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace' && !this.digitoCodigo(index) && index > 0) {
      const digits = this.codigoVerificacion.padEnd(OTP_LENGTH, ' ').split('');
      digits[index - 1] = ' ';
      this.codigoVerificacion = digits.join('');
      this.enfocarOtp(index - 1);
    }
  }

  onCodigoPaste(event: ClipboardEvent): void {
    const digits = event.clipboardData?.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!digits) {
      return;
    }

    event.preventDefault();
    this.codigoVerificacion = digits.padEnd(OTP_LENGTH, ' ');
    this.errorCodigo = null;
    this.enfocarOtp(Math.min(digits.length, OTP_LENGTH - 1));

    if (this.codigoCompleto()) {
      this.verificarCodigo();
    }
  }

  verificarCodigo(): void {
    if (this.cargandoAuth) {
      return;
    }

    if (!this.codigoCompleto()) {
      this.errorCodigo = 'Ingresa los 6 dígitos del código.';
      return;
    }

    this.errorCodigo = null;
    this.cargandoAuth = true;
    const codigo = this.codigoVerificacion.replace(/\D/g, '');

    this.auth.verificarCodigo(this.emailIngresado, codigo).subscribe({
      next: () => {
        this.cargandoAuth = false;
        this.finalizarSesion();
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.cargandoAuth = false;
        this.errorCodigo =
          error.status === 401
            ? 'Código inválido. Revisa los 6 dígitos e intenta nuevamente.'
            : this.mensajeError(error, 'No se pudo verificar el código.');
        this.cdr.detectChanges();
      }
    });
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

    if (this.passwordIngresado !== this.passwordConfirmacion) {
      this.errorAuth = 'Las contraseñas no coinciden.';
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

  cerrarSesion(): void {
    this.auth.cerrarSesion();
    this.emailAutenticado = '';
    this.nombreAutenticado = '';
    this.emailIngresado = '';
    this.prendaSeleccionada = null;
    this.mostrarNotificacion('Sesión cerrada correctamente.', 'exito');
  }

  private finalizarSesion(): void {
    const prendaPendiente = this.prendaPendiente;
    const sesion = this.auth.sesionActual;

    this.registroEnCurso = false;
    this.sesionIniciada = true;
    this.emailAutenticado = sesion?.email ?? this.emailIngresado;
    this.nombreAutenticado =
      sesion?.user?.nombre?.trim() || this.nombreDesdeEmail(this.emailAutenticado);
    this.emailIngresado = this.emailAutenticado;
    this.mostrarModalAuth = false;
    this.codigoEnviado = false;
    this.codigoVerificacion = '';
    this.errorAuth = null;
    this.errorCodigo = null;
    this.detenerReenvio();
    this.reenvioSegundos = 0;
    this.tipoAccionAuth = '';
    this.prendaPendiente = null;
    this.passwordIngresado = '';
    this.passwordConfirmacion = '';
    this.nombreIngresado = '';
    this.registroExitoso = false;
    this.nombreRegistrado = '';

    if (prendaPendiente) {
      this.prendaSeleccionada = prendaPendiente;
      this.scrollToProbador();
      this.mostrarNotificacion(
        `${prendaPendiente.nombre} lista para probar en tu avatar.`,
        'exito'
      );
      return;
    }

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
      this.prendaSeleccionada = null;
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

  private codigoCompleto(): boolean {
    return this.codigoVerificacion.replace(/\D/g, '').length === OTP_LENGTH;
  }

  private iniciarReenvio(): void {
    this.detenerReenvio();
    this.reenvioSegundos = RESEND_SECONDS;
    this.reenvioTimer = setInterval(() => {
      this.reenvioSegundos = Math.max(0, this.reenvioSegundos - 1);
      this.cdr.detectChanges();
      if (this.reenvioSegundos === 0) {
        this.detenerReenvio();
      }
    }, 1000);
  }

  private detenerReenvio(): void {
    if (this.reenvioTimer) {
      clearInterval(this.reenvioTimer);
      this.reenvioTimer = undefined;
    }
  }

  private enfocarOtp(index: number): void {
    setTimeout(() => {
      this.otpInputs?.get(index)?.nativeElement.focus();
    });
  }

  // ---------- Tiendas ----------

  vincularTienda(tienda: Tienda): void {
    if (this.redirigiendoTienda) {
      return;
    }

    this.redirigiendoTienda = tienda.nombre;
    this.redireccionTimer = setTimeout(() => {
      this.redireccionTimer = undefined;
      this.redirigiendoTienda = null;
      this.marcarTiendaVinculada(tienda.nombre);
      this.mostrarNotificacion(`${tienda.nombre} conectada correctamente.`, 'exito');
      this.cdr.detectChanges();
    }, 1500);
  }

  private marcarTiendaVinculada(nombre: string): void {
    this.tiendas = this.tiendas.map((tienda) =>
      tienda.nombre === nombre ? { ...tienda, vinculada: true } : tienda
    );
    this.guardarTiendas();
  }

  // ---------- Catálogo multi-tienda ----------

  get catalogoActivo(): TiendaCatalogo {
    return (
      this.catalogos.find((tienda) => tienda.id === this.tiendaCatalogoActiva) ??
      this.catalogos[0]
    );
  }

  seleccionarTiendaCatalogo(id: string): void {
    this.tiendaCatalogoActiva = id;
  }

  probarPrenda(prenda: Prenda): void {
    if (!this.sesionIniciada) {
      this.prendaPendiente = prenda;
      this.abrirAuthModal('prenda');
      return;
    }

    this.prendaSeleccionada = prenda;
    this.scrollToProbador();
    this.mostrarNotificacion(
      `${prenda.nombre} lista para probar en tu avatar.`,
      'exito'
    );
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

  // ---------- Exportación del avatar ----------

  exportarModelo(): void {
    if (!this.modelReady || !this.modelGroup || this.exportandoModelo) {
      this.mostrarNotificacion('Genera tu modelo 3D antes de exportarlo.', 'error');
      return;
    }

    this.exportandoModelo = true;
    const exporter = new GLTFExporter();

    exporter.parse(
      this.modelGroup,
      (resultado) => {
        const contenido =
          resultado instanceof ArrayBuffer ? resultado : JSON.stringify(resultado);
        const blob = new Blob([contenido], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');

        enlace.href = url;
        enlace.download = 'trender-avatar.glb';
        enlace.click();
        URL.revokeObjectURL(url);

        this.modelosExportados += 1;
        this.guardarModelosExportados();
        this.exportandoModelo = false;
        this.mostrarNotificacion('Avatar exportado en formato .GLB.', 'exito');
        this.cdr.detectChanges();
      },
      (error) => {
        console.error('No se pudo exportar el avatar:', error);
        this.exportandoModelo = false;
        this.mostrarNotificacion('No se pudo exportar el avatar.', 'error');
        this.cdr.detectChanges();
      },
      { binary: true }
    );
  }

  // ---------- FAQ ----------

  toggleFaq(index: number): void {
    this.faqAbierto = this.faqAbierto === index ? null : index;
  }

  // ---------- Notificaciones ----------

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

  // ---------- Persistencia local ----------

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
      const storesRaw = storage.getItem(STORES_STORAGE_KEY);
      if (storesRaw) {
        const vinculadas = JSON.parse(storesRaw);
        if (Array.isArray(vinculadas)) {
          const nombres = new Set(
            vinculadas.filter((nombre): nombre is string => typeof nombre === 'string')
          );
          this.tiendas = this.tiendas.map((tienda) => ({
            ...tienda,
            vinculada: nombres.has(tienda.nombre)
          }));
        }
      }
    } catch {
      storage.removeItem(STORES_STORAGE_KEY);
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

    try {
      const exportados = Number(storage.getItem(EXPORTED_MODELS_STORAGE_KEY));
      this.modelosExportados = Number.isFinite(exportados) && exportados > 0 ? exportados : 0;
    } catch {
      storage.removeItem(EXPORTED_MODELS_STORAGE_KEY);
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
  }

  private guardarModelosExportados(): void {
    this.guardarEnStorage(EXPORTED_MODELS_STORAGE_KEY, String(this.modelosExportados));
  }

  private guardarTiendas(): void {
    const vinculadas = this.tiendas.filter((tienda) => tienda.vinculada).map((tienda) => tienda.nombre);
    this.guardarEnStorage(STORES_STORAGE_KEY, JSON.stringify(vinculadas));
  }

  private guardarEnStorage(clave: string, valor: string): void {
    try {
      this.getStorage()?.setItem(clave, valor);
    } catch {
      // Almacenamiento no disponible o sin cuota: la demo continúa en memoria
    }
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
    this.scene.add(new THREE.AmbientLight(0xfff4e6, 1.05));

    // Luz principal cálida desde arriba a la derecha con sombras suaves
    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.35);
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
      this.mostrarNotificacion('Ingresa estatura y peso para generar tu avatar.', 'error');
      return;
    }

    this.isGenerating = true;
    this.modelReady = false;

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
        this.scrollToVisor();
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
