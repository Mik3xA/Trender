import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { Subscription, from, switchMap } from 'rxjs';

import { TONOS } from '../motor-3d/piel';
import { Genero, LIMITES, MEDIDAS_INICIALES, Medidas, TIPOS_CUERPO, TipoCuerpo, estimarContornos, sanearMedidas } from '../probador/cuerpo';
import { AjustesPrenda, MUESTRAS, NOMBRE_CATEGORIA, NOMBRE_TIPO, PrendaVirtual, vestirConjunto } from '../probador/prendas';
import { recomendarTalla } from '../probador/tallas';
import { ArmarioService, CATEGORIA_PROBADOR, CategoriaArmario, PrendaArmario, aPrendaVirtual, prepararFoto } from '../servicios/armario.service';
import { PerfilGenero, PerfilService, Perfiles } from '../servicios/perfil.service';
import { SesionService } from '../servicios/sesion.service';
import { TutorialService } from '../tutorial/tutorial.service';
import { Visor3dComponent } from '../visor-3d/visor-3d';
import { environment } from '../../environments/environment';

type Filtro = 'todo' | CategoriaArmario | 'basicos';
type Contorno = 'pecho' | 'cintura' | 'cadera';

const CLAVE_PERFILES = 'trender.perfiles';
const CLAVE_GENERO = 'trender.genero';
const GUARDADO_MS = 700;
const MAX_PRENDAS = 6;
const MAX_FOTOS_A_LA_VEZ = 6;
const MAX_BYTES_FOTO = 25 * 1024 * 1024;
const TIPOS_POR_CATEGORIA: Record<CategoriaArmario, string[]> = {
  top: ['camiseta', 'camisa', 'blusa', 'top', 'sueter', 'sudadera', 'chamarra', 'blazer', 'abrigo'],
  bottom: ['pantalon', 'jeans', 'jogger', 'leggings', 'short', 'falda'],
  dress: ['vestido'],
  shoes: ['tenis', 'zapatos', 'botas', 'sandalias'],
};
const categoriaDeTipo = (tipo: string): CategoriaArmario | null =>
  (Object.keys(TIPOS_POR_CATEGORIA) as CategoriaArmario[]).find((c) => TIPOS_POR_CATEGORIA[c].includes(tipo)) ?? null;

const perfilInicial = (genero: Genero): PerfilGenero => ({ medidas: { ...MEDIDAS_INICIALES[genero] }, conjunto: [], tono: 'maniqui' });

/**
 * Probador embebido en la página. Mujer y Hombre son apartados independientes:
 * cada uno tiene su cuerpo, su tono, su conjunto y su armario en el servidor.
 * No hay login: SesionService crea una sesión de invitado de forma transparente.
 */
@Component({
  selector: 'app-avatar-setup',
  imports: [Visor3dComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './avatar-setup.html',
})
export class AvatarSetupComponent implements OnInit {
  private readonly armarioApi = inject(ArmarioService);
  private readonly perfilApi = inject(PerfilService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly sesion = inject(SesionService);
  protected readonly tutorial = inject(TutorialService);

  protected readonly apiUrl = environment.apiUrl;
  protected readonly LIMITES = LIMITES;
  protected readonly TIPOS_CUERPO = TIPOS_CUERPO;
  protected readonly TONOS = TONOS;
  protected readonly NOMBRE_CATEGORIA = NOMBRE_CATEGORIA;
  protected readonly CATEGORIA_PROBADOR = CATEGORIA_PROBADOR;
  protected readonly CATEGORIAS: CategoriaArmario[] = ['top', 'bottom', 'dress', 'shoes'];
  protected readonly NOMBRE_TIPO = NOMBRE_TIPO;
  /** Atajos antes de subir ("¿Qué vas a subir?"). */
  protected readonly TIPOS_RAPIDOS = ['camiseta', 'camisa', 'sudadera', 'chamarra', 'pantalon', 'jeans', 'jogger', 'short', 'falda', 'vestido', 'tenis'];
  protected readonly GRUPOS_TIPO: Array<{ categoria: CategoriaArmario; nombre: string; tipos: string[] }> = [
    { categoria: 'top', nombre: 'Superior', tipos: TIPOS_POR_CATEGORIA.top },
    { categoria: 'bottom', nombre: 'Inferior', tipos: TIPOS_POR_CATEGORIA.bottom },
    { categoria: 'dress', nombre: 'Vestido', tipos: TIPOS_POR_CATEGORIA.dress },
    { categoria: 'shoes', nombre: 'Calzado', tipos: TIPOS_POR_CATEGORIA.shoes },
  ];
  protected readonly OPCIONES = {
    ajuste: [
      { id: 'ajustado', nombre: 'Ajustada' },
      { id: 'regular', nombre: 'Regular' },
      { id: 'holgado', nombre: 'Holgada' },
    ],
    largo: [
      { id: 'corto', nombre: 'Corto' },
      { id: 'normal', nombre: 'Normal' },
      { id: 'largo', nombre: 'Largo' },
    ],
    manga: [
      { id: 'sin', nombre: 'Sin' },
      { id: 'corta', nombre: 'Corta' },
      { id: 'tres-cuartos', nombre: '3/4' },
      { id: 'larga', nombre: 'Larga' },
    ],
  } as const;
  protected readonly FILTROS: Array<{ id: Filtro; nombre: string }> = [
    { id: 'todo', nombre: 'Todo' },
    { id: 'top', nombre: 'Superior' },
    { id: 'bottom', nombre: 'Inferior' },
    { id: 'dress', nombre: 'Vestidos' },
    { id: 'shoes', nombre: 'Calzado' },
    { id: 'basicos', nombre: 'Básicos' },
  ];

  // ---- apartados
  readonly genero = signal<Genero>(this.leer<Genero>(CLAVE_GENERO) === 'Masculino' ? 'Masculino' : 'Femenino');
  readonly perfiles = signal<Perfiles>(this.leerPerfiles());
  readonly perfil = computed(() => this.perfiles()[this.genero()]);
  readonly medidas = computed(() => this.perfil().medidas);
  readonly conjunto = computed(() => this.perfil().conjunto);
  readonly tono = computed(() => this.perfil().tono);
  readonly contornos = computed(() => estimarContornos(this.medidas()));
  readonly recomendaciones = computed(() => this.conjunto().map((prenda) => ({ prenda, talla: recomendarTalla(this.medidas(), prenda.categoria) })));

  // ---- armario
  readonly armario = signal<PrendaArmario[]>([]);
  readonly filtro = signal<Filtro>('todo');
  readonly cargandoArmario = signal(false);
  readonly basicos = computed(() =>
    MUESTRAS.filter((m) => this.genero() === 'Femenino' || (m.categoria !== 'Vestido' && m.tipo !== 'falda'))
  );
  readonly visibles = computed(() => {
    const f = this.filtro();
    return f === 'todo' ? this.armario() : this.armario().filter((p) => p.category === f);
  });

  // ---- importación (link o foto)
  readonly subiendo = signal(0);
  readonly arrastrando = signal(false);
  readonly nombreFoto = signal('');
  private readonly fichaId = signal<string | null>(null);
  /** Prenda cuyo análisis se muestra (se mantiene al día con el armario). */
  readonly ficha = computed(() => this.armario().find((p) => p.id === this.fichaId()) ?? null);
  /** Respuesta previa opcional: "voy a subir una sudadera". */
  readonly tipoSubida = signal<string | null>(null);
  readonly errorImportacion = signal<string | null>(null);

  // ---- interfaz
  readonly panelAbierto = signal(true);
  readonly notificacion = signal<string | null>(null);

  private readonly seguimientos = new Set<Subscription>();
  private guardadoTimer?: ReturnType<typeof setTimeout>;
  private notificacionTimer?: ReturnType<typeof setTimeout>;
  private omitirGuardado = true; // la primera ejecución del effect solo refleja lo cargado

  constructor() {
    effect(() => {
      const perfiles = this.perfiles();
      const genero = this.genero();
      this.escribir(CLAVE_PERFILES, perfiles);
      this.escribir(CLAVE_GENERO, genero);
      if (this.omitirGuardado) {
        this.omitirGuardado = false;
        return;
      }
      clearTimeout(this.guardadoTimer);
      this.guardadoTimer = setTimeout(() => this.perfilApi.guardar(genero, perfiles).subscribe({ error: () => undefined }), GUARDADO_MS);
    });
    // El tutorial necesita ver el panel lateral.
    effect(() => {
      if (this.tutorial.activo()) this.panelAbierto.set(true);
    });
    // Primera visita: el tutorial arranca cuando el probador entra en pantalla.
    afterNextRender(() => {
      if (this.tutorial.visto() || typeof IntersectionObserver === 'undefined') return;
      const observador = new IntersectionObserver(
        (entradas) => {
          if (entradas.some((e) => e.isIntersecting && e.intersectionRatio >= 0.6)) {
            observador.disconnect();
            this.tutorial.iniciarSiEsNuevo();
          }
        },
        { threshold: [0.6] }
      );
      observador.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => observador.disconnect());
    });
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.guardadoTimer);
      clearTimeout(this.notificacionTimer);
      this.seguimientos.forEach((s) => s.unsubscribe());
    });
  }

  ngOnInit(): void {
    this.perfilApi.obtener().subscribe({
      next: ({ perfiles }) => {
        if (!perfiles.Femenino && !perfiles.Masculino) return;
        this.omitirGuardado = true;
        this.perfiles.update((actual) => ({ ...actual, ...perfiles }));
      },
      error: () => undefined, // sin backend: el probador funciona con lo guardado en el navegador
    });
    this.cargarArmario();
  }

  // ------------------------------------------------------------------ apartados y cuerpo

  cambiarGenero(genero: Genero): void {
    if (genero === this.genero()) return;
    this.genero.set(genero);
    this.filtro.set('todo');
    this.errorImportacion.set(null);
    this.cargarArmario();
  }

  private actualizarPerfil(cambio: (p: PerfilGenero) => PerfilGenero): void {
    const genero = this.genero();
    this.perfiles.update((todos) => ({ ...todos, [genero]: cambio(todos[genero]) }));
  }

  cambiarNumero(campo: 'altura' | 'peso', valor: number | string): void {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return;
    const { min, max } = LIMITES[campo];
    this.actualizarPerfil((p) => ({ ...p, medidas: { ...p.medidas, [campo]: Math.min(max, Math.max(min, numero)) } }));
  }

  cambiarTipoCuerpo(tipo: TipoCuerpo): void {
    this.actualizarPerfil((p) => ({ ...p, medidas: { ...p.medidas, tipoCuerpo: tipo } }));
  }

  cambiarTono(tono: string): void {
    this.actualizarPerfil((p) => ({ ...p, tono }));
  }

  /** Medida exacta opcional; vacía o fuera de rango vuelve a la estimación. */
  cambiarContorno(campo: Contorno, valor: string | number | null): void {
    const numero = valor === '' || valor === null ? null : Number(valor);
    const valido = numero !== null && Number.isFinite(numero) && numero >= LIMITES.contorno.min && numero <= LIMITES.contorno.max;
    this.actualizarPerfil((p) => ({ ...p, medidas: { ...p.medidas, [campo]: valido ? numero : null } }));
  }

  // ------------------------------------------------------------------ conjunto

  estaPuesta(id: string): boolean {
    return this.conjunto().some((p) => p.id === id);
  }

  vestir(prenda: PrendaVirtual): void {
    this.actualizarPerfil((p) => ({ ...p, conjunto: vestirConjunto(p.conjunto, prenda).slice(-MAX_PRENDAS) }));
  }

  quitar(id: string): void {
    this.actualizarPerfil((p) => ({ ...p, conjunto: p.conjunto.filter((x) => x.id !== id) }));
  }

  quitarTodo(): void {
    this.actualizarPerfil((p) => ({ ...p, conjunto: [] }));
  }

  /** Clic en una tarjeta del armario: se aplica al avatar (o se quita si ya está puesta). */
  alternar(item: PrendaArmario): void {
    if (this.estaPuesta(item.id)) return this.quitar(item.id);
    const prenda = aPrendaVirtual(item);
    if (prenda) this.vestir(prenda);
  }

  alternarBasico(prenda: PrendaVirtual): void {
    if (this.estaPuesta(prenda.id)) this.quitar(prenda.id);
    else this.vestir(prenda);
  }

  // ------------------------------------------------------------------ armario e importación

  cargarArmario(): void {
    const genero = this.genero();
    this.cargandoArmario.set(true);
    this.armarioApi.listar(genero).subscribe({
      next: (items) => {
        if (genero !== this.genero()) return;
        this.armario.set(items);
        this.cargandoArmario.set(false);
        for (const item of items) if (item.status === 'processing') this.seguir(item.id);
      },
      error: () => this.cargandoArmario.set(false),
    });
  }

  /** Sube una o varias fotos de prendas (se analizan en el servidor). */
  subirArchivos(archivos: FileList | File[] | null | undefined): void {
    this.errorImportacion.set(null);
    const lista = Array.from(archivos ?? []);
    const fotos = lista.filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (!fotos.length) {
      if (lista.length) this.errorImportacion.set('Elige una imagen (JPG, PNG, WEBP o HEIC).');
      return;
    }
    if (fotos.length > MAX_FOTOS_A_LA_VEZ) this.avisar(`Se subirán las primeras ${MAX_FOTOS_A_LA_VEZ} fotos.`);
    const genero = this.genero();
    const nombre = fotos.length === 1 ? this.nombreFoto().trim() : '';
    this.nombreFoto.set('');
    this.filtro.set('todo');
    for (const archivo of fotos.slice(0, MAX_FOTOS_A_LA_VEZ)) {
      if (archivo.size > MAX_BYTES_FOTO) {
        this.errorImportacion.set(`"${archivo.name}" pesa más de 25 MB.`);
        continue;
      }
      this.subiendo.update((n) => n + 1);
      const tipo = this.tipoSubida() ?? undefined;
      const unaSola = fotos.length === 1;
      from(prepararFoto(archivo))
        .pipe(switchMap((blob) => this.armarioApi.subirFoto(blob, genero, { nombre: nombre || undefined, tipo })))
        .subscribe({
          next: (item) => {
            this.recibir(item, genero);
            // Al terminar el análisis se abre el cuestionario para afinar cómo se ve en el avatar.
            if (unaSola && (item.status === 'ready' || item.status === 'review') && genero === this.genero()) this.fichaId.set(item.id);
          },
          error: (error: HttpErrorResponse) => {
            this.subiendo.update((n) => n - 1);
            this.errorImportacion.set(this.mensajeError(error));
          },
          complete: () => this.subiendo.update((n) => n - 1),
        });
    }
  }

  /** Añade o cambia la foto de una prenda (p. ej. un link cuya tienda no dejó ver la foto). */
  agregarFotoA(item: PrendaArmario, archivos: FileList | null | undefined): void {
    const archivo = archivos?.[0];
    if (!archivo) return;
    const genero = this.genero();
    this.quitar(item.id);
    this.reemplazar({ ...item, status: 'processing' });
    from(prepararFoto(archivo))
      .pipe(switchMap((blob) => this.armarioApi.agregarFoto(item.id, blob)))
      .subscribe({
        next: (actualizada) => this.recibir(actualizada, genero),
        error: (error: HttpErrorResponse) => {
          this.reemplazar(item);
          this.avisar(this.mensajeError(error));
        },
      });
  }

  verFicha(item: PrendaArmario, evento?: Event): void {
    evento?.stopPropagation();
    this.fichaId.set(this.fichaId() === item.id ? null : item.id);
  }

  cerrarFicha(): void {
    this.fichaId.set(null);
  }

  tiposDe(categoria: CategoriaArmario): string[] {
    return TIPOS_POR_CATEGORIA[categoria];
  }

  /** ¿El análisis propuso este tipo? (se resalta en el cuestionario). */
  sugerido(item: PrendaArmario, tipo: string): boolean {
    return item.analisis?.visual?.sugerencias?.slice(0, 3).includes(tipo) ?? false;
  }

  /** Respuesta actual de una pregunta: la del usuario o, si no hay, lo que se vio en la foto. */
  respuesta(item: PrendaArmario, clave: keyof AjustesPrenda): string | boolean | undefined {
    const guardada = item.ajustes?.[clave];
    if (guardada !== undefined) return guardada;
    const visto = item.analisis?.visual?.detalle;
    if (clave === 'manga') return visto?.manga ?? undefined;
    if (clave === 'capucha') return visto?.capucha ?? (item.tipo === 'sudadera' ? true : undefined);
    if (clave === 'cuello') return ['camisa', 'chamarra', 'blazer', 'abrigo'].includes(item.tipo ?? '');
    if (clave === 'ajuste') return 'regular';
    if (clave === 'largo') return 'normal';
    return undefined;
  }

  /**
   * Guarda una respuesta del cuestionario (tipo de prenda o cómo queda) y
   * vuelve a vestir la prenda para que el avatar la muestre al instante.
   */
  responder(item: PrendaArmario, cambios: { tipo?: string; ajustes?: AjustesPrenda }): void {
    const categoria = cambios.tipo ? categoriaDeTipo(cambios.tipo) : item.category;
    if (!categoria) return;
    // Optimista: el avatar cambia ya; si el servidor falla se vuelve atrás.
    const previa = item;
    const local: PrendaArmario = {
      ...item,
      category: categoria,
      tipo: cambios.tipo ?? item.tipo,
      status: 'ready',
      ajustes: cambios.ajustes ? { ...(item.ajustes ?? {}), ...cambios.ajustes } : item.ajustes,
    };
    this.reemplazar(local);
    this.revestir(local);
    this.armarioApi.clasificar(item.id, categoria, cambios.tipo, cambios.ajustes).subscribe({
      next: (actualizada) => {
        this.reemplazar(actualizada);
        this.revestir(actualizada);
      },
      error: (error: HttpErrorResponse) => {
        this.reemplazar(previa);
        this.revestir(previa);
        this.avisar(this.mensajeError(error));
      },
    });
  }

  /** Corrige el tipo concreto (p. ej. "sueter" -> "sudadera"). */
  cambiarTipo(item: PrendaArmario, tipo: string): void {
    if (tipo !== item.tipo) this.responder(item, { tipo });
  }

  /** Si la prenda está puesta (o se está ajustando), se vuelve a vestir con sus datos nuevos. */
  private revestir(item: PrendaArmario): void {
    const prenda = aPrendaVirtual(item);
    if (!prenda) return;
    if (this.estaPuesta(item.id)) this.quitar(item.id);
    this.vestir(prenda);
  }

  /** Corrige o elige la categoría de una prenda y la viste. */
  clasificar(item: PrendaArmario, categoria: CategoriaArmario): void {
    this.armarioApi.clasificar(item.id, categoria, categoria === item.category ? undefined : this.tipoPor(categoria)).subscribe({
      next: (actualizada) => {
        this.reemplazar(actualizada);
        this.quitar(item.id);
        const prenda = aPrendaVirtual(actualizada);
        if (prenda) this.vestir(prenda);
      },
      error: (error: HttpErrorResponse) => this.avisar(this.mensajeError(error)),
    });
  }

  eliminar(item: PrendaArmario, evento?: Event): void {
    evento?.stopPropagation();
    this.armarioApi.eliminar(item.id).subscribe({
      next: () => {
        this.armario.update((lista) => lista.filter((p) => p.id !== item.id));
        this.quitar(item.id);
      },
      error: (error: HttpErrorResponse) => this.avisar(this.mensajeError(error)),
    });
  }

  confianza(item: PrendaArmario): string {
    const c = item.analisis?.confianza;
    return c === 'alta' ? 'Seguro' : c === 'media' ? 'Probable' : c === 'baja' ? 'Dudoso' : '';
  }

  // ------------------------------------------------------------------ interfaz

  alternarPanel(): void {
    this.panelAbierto.update((v) => !v);
  }

  avisar(mensaje: string): void {
    clearTimeout(this.notificacionTimer);
    this.notificacion.set(mensaje);
    this.notificacionTimer = setTimeout(() => this.notificacion.set(null), 3800);
  }

  // ------------------------------------------------------------------ privados

  private seguir(id: string): void {
    const genero = this.genero();
    const sub = this.armarioApi.seguir(id).subscribe({ next: (item) => this.recibir(item, genero), error: () => undefined });
    this.seguimientos.add(sub);
  }

  /** Cada respuesta del sondeo actualiza la tarjeta; al terminar se viste o se pide la categoría. */
  private recibir(item: PrendaArmario, genero: Genero): void {
    if (genero !== this.genero()) return; // el usuario cambió de apartado mientras tanto
    this.reemplazar(item);
    if (item.status === 'ready') {
      const prenda = aPrendaVirtual(item);
      if (prenda) {
        this.vestir(prenda);
        const sinFoto = item.analisis?.sinFoto ? ' · añade una foto para verla en el avatar' : '';
        this.avisar(`${NOMBRE_CATEGORIA[prenda.categoria]} · ${prenda.tipo}: ${prenda.nombre}${sinFoto}`);
      }
    } else if (item.status === 'review') {
      this.avisar('No estamos seguros del tipo de prenda: elige qué es en tu armario.');
    } else if (item.status === 'failed') {
      this.avisar(item.error ?? 'No se pudo analizar la foto.');
    }
  }

  private reemplazar(item: PrendaArmario): void {
    this.armario.update((lista) => (lista.some((p) => p.id === item.id) ? lista.map((p) => (p.id === item.id ? item : p)) : [item, ...lista]));
  }

  private tipoPor(categoria: CategoriaArmario): string {
    return { top: 'camiseta', bottom: 'pantalon', dress: 'vestido', shoes: 'tenis' }[categoria];
  }

  private mensajeError(error: HttpErrorResponse): string {
    if (error.status === 0) return 'No se pudo conectar con el servidor. Verifica que el backend esté activo.';
    const detalles = error.error?.errors;
    if (Array.isArray(detalles) && detalles.length) return detalles.map((d: { message?: string }) => d.message).join(' · ');
    return error.error?.error ?? error.error?.message ?? 'Algo salió mal. Intenta de nuevo.';
  }

  private leerPerfiles(): Perfiles {
    const guardados = this.leer<Partial<Record<Genero, Partial<PerfilGenero>>>>(CLAVE_PERFILES) ?? {};
    const perfil = (genero: Genero): PerfilGenero => {
      const p = guardados[genero];
      if (!p?.medidas) return perfilInicial(genero);
      return {
        medidas: sanearMedidas({ ...(p.medidas as Medidas), genero }),
        conjunto: Array.isArray(p.conjunto) ? p.conjunto.filter((x) => x && typeof x.id === 'string').slice(0, MAX_PRENDAS) : [],
        tono: typeof p.tono === 'string' ? p.tono : 'maniqui',
      };
    };
    return { Femenino: perfil('Femenino'), Masculino: perfil('Masculino') };
  }

  private leer<T>(clave: string): T | null {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(clave) : null;
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private escribir(clave: string, valor: unknown): void {
    try {
      window.localStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      /* sin almacenamiento: todo sigue en memoria */
    }
  }
}
