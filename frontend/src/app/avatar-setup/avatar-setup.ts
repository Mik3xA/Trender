import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  Genero,
  LIMITES,
  MEDIDAS_INICIALES,
  Medidas,
  TIPOS_CUERPO,
  TipoCuerpo,
  estimarContornos,
  imc,
  sanearMedidas,
} from '../probador/cuerpo';
import {
  CategoriaPrenda,
  MUESTRAS,
  NOMBRE_CATEGORIA,
  PrendaEscaneada,
  PrendaVirtual,
  prendaDesdeEscaneo,
  vestirConjunto,
} from '../probador/prendas';
import { recomendarTalla } from '../probador/tallas';
import { AuthService, StoredSession } from '../servicios/auth.service';
import { PerfilService } from '../servicios/perfil.service';
import { RopaService } from '../servicios/ropa.service';
import { Visor3dComponent } from '../visor-3d/visor-3d';

type AuthMode = 'login' | 'registro';
type Paso = 'cuerpo' | 'prenda' | 'talla';
type TipoNotificacion = 'exito' | 'error';
type Contorno = 'pecho' | 'cintura' | 'cadera';

const MEDIDAS_KEY = 'trender.measurements';
const CONJUNTO_KEY = 'trender.outfit';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GUARDADO_PERFIL_MS = 600;
const MAX_PRENDAS = 6;

/** Página del probador: cuenta, medidas, escáner de prendas, tallas y visor 3D. */
@Component({
  selector: 'app-avatar-setup',
  imports: [FormsModule, Visor3dComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './avatar-setup.html',
  styleUrl: './avatar-setup.scss',
})
export class AvatarSetupComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly perfil = inject(PerfilService);
  private readonly ropa = inject(RopaService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly LIMITES = LIMITES;
  protected readonly TIPOS_CUERPO = TIPOS_CUERPO;
  protected readonly MUESTRAS = MUESTRAS;
  protected readonly NOMBRE_CATEGORIA = NOMBRE_CATEGORIA;
  protected readonly CATEGORIAS: CategoriaPrenda[] = ['Torso', 'Piernas', 'Vestido', 'Calzado'];

  // ---- probador
  readonly medidas = signal<Medidas>(sanearMedidas(this.leer<Partial<Medidas>>(MEDIDAS_KEY)));
  readonly conjunto = signal<PrendaVirtual[]>(this.leerConjunto());
  readonly paso = signal<Paso>('cuerpo');
  readonly contornos = computed(() => estimarContornos(this.medidas()));
  readonly indiceMasa = computed(() => Math.round(imc(this.medidas()) * 10) / 10);
  readonly recomendaciones = computed(() =>
    this.conjunto().map((prenda) => ({ prenda, talla: recomendarTalla(this.medidas(), prenda.categoria) }))
  );
  readonly pantallaCompleta = signal(false);

  // ---- escáner
  readonly urlEscaneo = signal('');
  readonly escaneando = signal(false);
  readonly errorEscaneo = signal<string | null>(null);
  readonly prendaEscaneada = signal<PrendaEscaneada | null>(null);

  // ---- cuenta
  readonly sesionIniciada = signal(false);
  readonly nombreAutenticado = signal('');
  readonly emailAutenticado = signal('');
  mostrarModalAuth = false;
  modoAuth: AuthMode = 'login';
  nombreIngresado = '';
  emailIngresado = '';
  passwordIngresado = '';
  readonly cargandoAuth = signal(false);
  readonly errorAuth = signal<string | null>(null);
  readonly registroExitoso = signal(false);
  readonly nombreRegistrado = signal('');

  readonly notificacion = signal<{ mensaje: string; tipo: TipoNotificacion } | null>(null);

  private guardadoTimer?: ReturnType<typeof setTimeout>;
  private notificacionTimer?: ReturnType<typeof setTimeout>;
  private registroTimer?: ReturnType<typeof setTimeout>;
  /**
   * Evita reenviar al backend lo que acabamos de recibir de él. Empieza en true
   * para que la primera ejecución del effect (al cargar) no pise el perfil guardado.
   */
  private sincronizandoDesdeServidor = true;
  /** Durante la confirmación de registro la sesión aún no se muestra en la interfaz. */
  private registrando = false;
  /** Tras cerrar sesión no se vuelve a escribir nada en localStorage. */
  private omitirPersistencia = false;

  constructor() {
    effect(() => {
      const medidas = this.medidas();
      const conjunto = this.conjunto();
      if (this.omitirPersistencia) {
        this.omitirPersistencia = false;
        return;
      }
      this.escribir(MEDIDAS_KEY, medidas);
      this.escribir(CONJUNTO_KEY, conjunto);
      if (this.sincronizandoDesdeServidor) {
        this.sincronizandoDesdeServidor = false;
        return;
      }
      this.programarGuardado();
    });
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.guardadoTimer);
      clearTimeout(this.notificacionTimer);
      clearTimeout(this.registroTimer);
    });
  }

  ngOnInit(): void {
    const suscripcion = this.auth.sesion$.subscribe((sesion) => this.aplicarSesion(sesion));
    this.destroyRef.onDestroy(() => suscripcion.unsubscribe());
    this.auth.refrescarSesion();
    if (this.auth.sesionActual?.token) this.cargarPerfil();
  }

  // ------------------------------------------------------------------ medidas

  get tituloAuth(): string {
    return this.modoAuth === 'registro' ? 'Crea tu cuenta' : 'Inicia sesión';
  }

  get descripcionAuth(): string {
    return this.modoAuth === 'registro'
      ? 'Guarda tus medidas y tu conjunto para usarlos en cualquier dispositivo.'
      : 'Recupera tus medidas y tu conjunto guardados.';
  }

  cambiarGenero(genero: Genero): void {
    if (genero === this.medidas().genero) return;
    // Al cambiar de género se parte de proporciones típicas, conservando altura y peso.
    this.medidas.update((m) => ({ ...MEDIDAS_INICIALES[genero], altura: m.altura, peso: m.peso }));
  }

  cambiarNumero(campo: 'altura' | 'peso', valor: number | string): void {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return;
    const { min, max } = LIMITES[campo];
    this.medidas.update((m) => ({ ...m, [campo]: Math.min(max, Math.max(min, numero)) }));
  }

  cambiarTipoCuerpo(tipo: TipoCuerpo): void {
    this.medidas.update((m) => ({ ...m, tipoCuerpo: tipo }));
  }

  /** Medida exacta opcional; vacío o fuera de rango vuelve a la estimación. */
  cambiarContorno(campo: Contorno, valor: string | number | null): void {
    const numero = valor === '' || valor === null ? null : Number(valor);
    const valido =
      numero !== null && Number.isFinite(numero) && numero >= LIMITES.contorno.min && numero <= LIMITES.contorno.max;
    this.medidas.update((m) => ({ ...m, [campo]: valido ? numero : null }));
  }

  restablecerMedidas(): void {
    this.medidas.set({ ...MEDIDAS_INICIALES[this.medidas().genero] });
  }

  // ------------------------------------------------------------------ prendas

  vestir(prenda: PrendaVirtual): void {
    this.conjunto.update((c) => vestirConjunto(c, prenda).slice(-MAX_PRENDAS));
  }

  quitar(id: string): void {
    this.conjunto.update((c) => c.filter((p) => p.id !== id));
  }

  quitarTodo(): void {
    this.conjunto.set([]);
  }

  estaPuesta(id: string): boolean {
    return this.conjunto().some((p) => p.id === id);
  }

  escanearProducto(): void {
    const url = this.urlEscaneo().trim();
    this.errorEscaneo.set(null);
    if (!/^https?:\/\/\S+\.\S+/i.test(url)) {
      this.errorEscaneo.set('Pega el enlace completo del producto (empieza con https://).');
      return;
    }
    this.escaneando.set(true);
    this.prendaEscaneada.set(null);
    this.ropa.escanear(url).subscribe({
      next: (prenda) => {
        this.escaneando.set(false);
        this.prendaEscaneada.set(prenda);
        const vestible = prendaDesdeEscaneo(prenda);
        if (vestible) {
          this.vestir(vestible);
          this.mostrarNotificacion(`Probando: ${vestible.nombre}`, 'exito');
        }
      },
      error: (error: HttpErrorResponse) => {
        this.escaneando.set(false);
        this.errorEscaneo.set(
          error.status === 400
            ? this.mensajeError(error, 'Ese enlace no es válido.')
            : 'No pudimos analizar este enlace. Revisa la URL o elige una prenda de muestra.'
        );
      },
    });
  }

  /** El escáner no reconoció la prenda (o se equivocó): el usuario elige la categoría. */
  elegirCategoria(categoria: CategoriaPrenda): void {
    const escaneada = this.prendaEscaneada();
    if (!escaneada) return;
    const prenda = prendaDesdeEscaneo(escaneada, categoria)!;
    this.prendaEscaneada.set({ ...escaneada, categoria, tipo: prenda.tipo, motivo: null });
    this.vestir(prenda);
    this.mostrarNotificacion(`Probando: ${prenda.nombre}`, 'exito');
  }

  limpiarEscaneo(): void {
    this.urlEscaneo.set('');
    this.prendaEscaneada.set(null);
    this.errorEscaneo.set(null);
  }

  // ------------------------------------------------------------------ cuenta

  abrirAuthModal(modo: AuthMode): void {
    this.modoAuth = modo;
    this.mostrarModalAuth = true;
    this.errorAuth.set(null);
    this.passwordIngresado = '';
  }

  cerrarModalAuth(): void {
    if (this.cargandoAuth() || this.registroExitoso()) return;
    this.mostrarModalAuth = false;
    this.errorAuth.set(null);
    this.passwordIngresado = '';
  }

  cambiarModoAuth(modo: AuthMode): void {
    this.modoAuth = modo;
    this.errorAuth.set(null);
  }

  registrarConPassword(): void {
    if (this.cargandoAuth()) return;
    const nombre = this.nombreIngresado.trim();
    const email = this.emailIngresado.trim();
    if (!nombre) return this.errorAuth.set('Ingresa tu nombre.');
    if (!EMAIL_REGEX.test(email)) return this.errorAuth.set('Ingresa un correo electrónico válido.');
    if (this.passwordIngresado.length < 8) return this.errorAuth.set('La contraseña debe tener al menos 8 caracteres.');

    this.errorAuth.set(null);
    this.cargandoAuth.set(true);
    this.registrando = true;
    this.auth.registrar({ nombre, email, password: this.passwordIngresado }).subscribe({
      next: () => {
        this.cargandoAuth.set(false);
        this.nombreRegistrado.set(this.auth.sesionActual?.user?.nombre?.trim() || nombre);
        this.registroExitoso.set(true);
        this.registroTimer = setTimeout(() => {
          this.registroExitoso.set(false);
          this.registrando = false;
          this.finalizarAcceso();
          // Cuenta nueva: se guardan en ella las medidas que ya tenía en pantalla.
          this.guardarPerfilAhora();
        }, 2000);
      },
      error: (error: HttpErrorResponse) => {
        this.cargandoAuth.set(false);
        this.registrando = false;
        this.errorAuth.set(this.mensajeError(error, 'No se pudo crear la cuenta.'));
      },
    });
  }

  iniciarSesionConPassword(): void {
    if (this.cargandoAuth()) return;
    const email = this.emailIngresado.trim();
    if (!EMAIL_REGEX.test(email) || !this.passwordIngresado) return this.errorAuth.set('Ingresa tu correo y contraseña.');

    this.errorAuth.set(null);
    this.cargandoAuth.set(true);
    this.auth.iniciarSesion({ email, password: this.passwordIngresado }).subscribe({
      next: () => {
        this.cargandoAuth.set(false);
        this.finalizarAcceso();
        this.cargarPerfil();
      },
      error: (error: HttpErrorResponse) => {
        this.cargandoAuth.set(false);
        this.errorAuth.set(
          error.status === 401
            ? 'Credenciales inválidas. Revisa tu correo y contraseña.'
            : this.mensajeError(error, 'No se pudo iniciar sesión.')
        );
      },
    });
  }

  cerrarSesion(): void {
    this.auth.cerrarSesion();
    clearTimeout(this.guardadoTimer);
    this.omitirPersistencia = true;
    this.medidas.set({ ...MEDIDAS_INICIALES[this.medidas().genero] });
    this.conjunto.set([]);
    this.limpiarEscaneo();
    this.paso.set('cuerpo');
    this.mostrarNotificacion('Sesión cerrada. Tus datos se borraron de este dispositivo.', 'exito');
  }

  // ------------------------------------------------------------------ interfaz

  alternarPantallaCompleta(): void {
    this.pantallaCompleta.update((v) => !v);
  }

  mostrarNotificacion(mensaje: string, tipo: TipoNotificacion): void {
    clearTimeout(this.notificacionTimer);
    this.notificacion.set({ mensaje, tipo });
    this.notificacionTimer = setTimeout(() => this.notificacion.set(null), 3500);
  }

  cerrarNotificacion(): void {
    clearTimeout(this.notificacionTimer);
    this.notificacion.set(null);
  }

  // ------------------------------------------------------------------ privados

  private finalizarAcceso(): void {
    this.mostrarModalAuth = false;
    this.passwordIngresado = '';
    this.nombreIngresado = '';
    this.aplicarSesion(this.auth.sesionActual);
  }

  private aplicarSesion(sesion: StoredSession | null): void {
    const activa = !!sesion?.sesionIniciada && !this.registrando;
    this.sesionIniciada.set(activa);
    this.emailAutenticado.set(activa ? sesion!.email : '');
    this.nombreAutenticado.set(activa ? sesion!.user?.nombre?.trim() || sesion!.email.split('@')[0] : '');
  }

  private cargarPerfil(): void {
    this.perfil.obtener().subscribe({
      next: (guardado) => {
        if (!guardado) {
          this.guardarPerfilAhora(); // cuenta sin medidas: se guardan las actuales
          return;
        }
        this.sincronizandoDesdeServidor = true;
        this.medidas.set(guardado.medidas);
        this.conjunto.set(guardado.conjunto);
      },
      error: () => undefined,
    });
  }

  private programarGuardado(): void {
    clearTimeout(this.guardadoTimer);
    if (!this.auth.obtenerToken()) return;
    this.guardadoTimer = setTimeout(() => this.guardarPerfilAhora(), GUARDADO_PERFIL_MS);
  }

  private guardarPerfilAhora(): void {
    if (!this.auth.obtenerToken()) return;
    this.perfil.guardar({ medidas: this.medidas(), conjunto: this.conjunto() }).subscribe({ error: () => undefined });
  }

  private mensajeError(error: HttpErrorResponse, fallback: string): string {
    if (error.status === 0) return 'No se pudo conectar con el servidor. Verifica que el backend esté activo.';
    const detalles = error.error?.errors;
    if (Array.isArray(detalles) && detalles.length) {
      return detalles.map((d: { message?: string }) => d.message).filter(Boolean).join(' · ');
    }
    return error.error?.message ?? error.error?.error ?? fallback;
  }

  private leerConjunto(): PrendaVirtual[] {
    const guardado = this.leer<PrendaVirtual[]>(CONJUNTO_KEY);
    return Array.isArray(guardado)
      ? guardado.filter((p) => p && typeof p.id === 'string' && typeof p.color === 'string').slice(0, MAX_PRENDAS)
      : [];
  }

  private leer<T>(clave: string): T | null {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(clave) : null;
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null; // JSON corrupto o almacenamiento bloqueado
    }
  }

  private escribir(clave: string, valor: unknown): void {
    try {
      window.localStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      // Sin almacenamiento: el probador sigue funcionando en memoria.
    }
  }
}
