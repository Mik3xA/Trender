import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { Subscription, from, switchMap } from 'rxjs';

import {
  AjustesPrenda,
  CategoriaArmario,
  NOMBRE_CATEGORIA,
  NOMBRE_TIPO,
  TIPOS_POR_CATEGORIA,
  categoriaDeTipo,
  partesDe,
} from '../probador/prendas';
import { TONOS } from '../motor-3d/piel';
import { LIMITES, MEDIDAS_INICIALES, Medidas, TIPOS_CUERPO, TipoCuerpo, sanearMedidas } from '../probador/cuerpo';
import { CategoriaPrenda, ESTILOS, COLOR_POR_DEFECTO, PrendaVirtual, TIPO_POR_CATEGORIA } from '../probador/estilos';
import { recomendarTalla } from '../probador/tallas';
import { ArmarioService, Genero, PrendaArmario, prepararFoto, urlPrenda } from '../servicios/armario.service';
import { SesionService } from '../servicios/sesion.service';
import { TutorialService } from '../tutorial/tutorial.service';
import { Visor3dComponent } from '../visor-3d/visor-3d';

type Filtro = 'todo' | CategoriaArmario;

interface Seleccion {
  id: string;
}

const CLAVE_GENERO = 'trender.genero';
const CLAVE_CUERPOS = 'trender.cuerpos';
const CLAVE_PUESTO = 'trender.puesto';

interface Cuerpo {
  medidas: Medidas;
  tono: string;
}

const CATEGORIA_3D: Record<Exclude<CategoriaArmario, 'outfit'>, CategoriaPrenda> = { top: 'Torso', bottom: 'Piernas', dress: 'Vestido', shoes: 'Calzado' };

/** Prenda del armario lista para vestir en el modelo 3D (null si aún no se puede). */
export function aPrenda3d(p: PrendaArmario): PrendaVirtual | null {
  if (p.status !== 'ready' || !p.category || p.category === 'outfit') return null;
  const categoria = CATEGORIA_3D[p.category];
  const visto = p.analisis?.visual;
  const liso = !visto?.detalle.estampado || visto.detalle.estampado === 'liso';
  return {
    id: p.id,
    nombre: p.nombre ?? 'Prenda',
    categoria,
    tipo: p.tipo && ESTILOS[p.tipo] ? p.tipo : TIPO_POR_CATEGORIA[categoria],
    color: p.color ?? COLOR_POR_DEFECTO[categoria],
    imagen: urlPrenda(p),
    zonas: (visto as { zonas?: PrendaVirtual['zonas'] } | null | undefined)?.zonas,
    estampado: visto?.detalle.estampado ?? null,
    // Lisa: color y tejido limpios. Con rayas o estampado: se proyecta la foto.
    aspecto: p.ajustes?.aspecto ?? (liso ? 'tela' : 'foto'),
    ajustes: {
      ...(visto?.detalle.manga ? { manga: visto.detalle.manga } : {}),
      ...(visto?.detalle.capucha ? { capucha: true } : {}),
      ...(p.ajustes ?? {}),
    },
  };
}
const MAX_FOTOS_A_LA_VEZ = 8;
const MAX_BYTES_FOTO = 25 * 1024 * 1024;

const esImagen = (f: File) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name);

/**
 * Probador 3D: tu modelo (izquierda), el visor con la ropa puesta (centro) y tu
 * armario (derecha). Mujer y Hombre tienen modelo, conjunto y armario propios.
 * No hay login: SesionService crea una sesión de invitado.
 */
@Component({
  selector: 'tr-estudio',
  imports: [Visor3dComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './estudio.html',
})
export class EstudioComponent implements OnInit {
  private readonly armarioApi = inject(ArmarioService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly sesion = inject(SesionService);
  protected readonly tutorial = inject(TutorialService);

  protected readonly NOMBRE_TIPO = NOMBRE_TIPO;
  protected readonly NOMBRE_CATEGORIA = NOMBRE_CATEGORIA;
  protected readonly urlPrenda = urlPrenda;
  protected readonly LIMITES = LIMITES;
  protected readonly TIPOS_CUERPO = TIPOS_CUERPO;
  protected readonly TONOS = TONOS;
  protected readonly FILTROS: Array<{ id: Filtro; nombre: string }> = [
    { id: 'todo', nombre: 'Todo' },
    { id: 'top', nombre: 'Superior' },
    { id: 'bottom', nombre: 'Inferior' },
    { id: 'dress', nombre: 'Vestidos' },
    { id: 'shoes', nombre: 'Calzado' },
  ];
  /** Atajos antes de subir ("¿Qué vas a subir?"). */
  protected readonly TIPOS_RAPIDOS = ['camiseta', 'camisa', 'sudadera', 'chamarra', 'pantalon', 'jeans', 'jogger', 'falda', 'vestido', 'tenis', 'botas'];
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
    aspecto: [
      { id: 'tela', nombre: 'Color y tejido' },
      { id: 'foto', nombre: 'Foto de la prenda' },
    ],
  } as const;

  // ---- armario
  readonly genero = signal<Genero>(this.leer(CLAVE_GENERO) === 'Masculino' ? 'Masculino' : 'Femenino');
  readonly armario = signal<PrendaArmario[]>([]);
  readonly filtro = signal<Filtro>('todo');
  readonly cargandoArmario = signal(false);
  readonly visibles = computed(() => {
    const f = this.filtro();
    return f === 'todo' ? this.armario() : this.armario().filter((p) => p.category === f);
  });
  readonly subiendo = signal(0);
  readonly arrastrando = signal(false);
  readonly tipoSubida = signal<string | null>(null);
  readonly errorSubida = signal<string | null>(null);
  readonly porBorrar = signal<string | null>(null);

  // ---- cuestionario
  private readonly fichaId = signal<string | null>(null);
  readonly ficha = computed(() => this.armario().find((p) => p.id === this.fichaId()) ?? null);

  // ---- tu modelo (uno por apartado)
  readonly cuerpos = signal<Record<Genero, Cuerpo>>(this.leerCuerpos());
  readonly medidas = computed(() => this.cuerpos()[this.genero()].medidas);
  readonly tono = computed(() => this.cuerpos()[this.genero()].tono);

  // ---- lo que lleva puesto (por apartado)
  private readonly puesto = signal<Record<Genero, string[]>>(this.leerJson(CLAVE_PUESTO) ?? { Femenino: [], Masculino: [] });
  readonly seleccion = computed<Seleccion[]>(() => this.puesto()[this.genero()].map((id) => ({ id })));
  readonly seleccionadas = computed(() =>
    this.seleccion()
      .map((s) => ({ ...s, prenda: this.armario().find((p) => p.id === s.id) }))
      .filter((s): s is Seleccion & { prenda: PrendaArmario } => !!s.prenda)
  );
  /** Prendas 3D que viste el modelo. */
  readonly conjunto = computed(() => this.seleccionadas().map((s) => aPrenda3d(s.prenda)).filter((p): p is PrendaVirtual => !!p));

  // ---- interfaz
  readonly notificacion = signal<string | null>(null);
  private readonly seguimientos = new Set<Subscription>();
  private notificacionTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => this.escribir(CLAVE_GENERO, this.genero()));
    effect(() => this.escribir(CLAVE_CUERPOS, this.cuerpos()));
    effect(() => this.escribir(CLAVE_PUESTO, this.puesto()));
    // Primera visita: el tutorial arranca cuando el probador entra en pantalla.
    afterNextRender(() => {
      if (this.tutorial.visto() || typeof IntersectionObserver === 'undefined') return;
      const observador = new IntersectionObserver(
        (entradas) => {
          if (entradas.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)) {
            observador.disconnect();
            this.tutorial.iniciarSiEsNuevo();
          }
        },
        { threshold: [0.5] }
      );
      observador.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => observador.disconnect());
    });
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.notificacionTimer);
      this.seguimientos.forEach((s) => s.unsubscribe());
    });
  }

  ngOnInit(): void {
    this.cargarArmario();
  }

  // ------------------------------------------------------------------ tu modelo

  private actualizarCuerpo(cambio: (c: Cuerpo) => Cuerpo): void {
    const genero = this.genero();
    this.cuerpos.update((todos) => ({ ...todos, [genero]: cambio(todos[genero]) }));
  }

  cambiarNumero(campo: 'altura' | 'peso', valor: number | string): void {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return;
    const { min, max } = LIMITES[campo];
    this.actualizarCuerpo((c) => ({ ...c, medidas: { ...c.medidas, [campo]: Math.min(max, Math.max(min, numero)) } }));
  }

  cambiarTipoCuerpo(tipo: TipoCuerpo): void {
    this.actualizarCuerpo((c) => ({ ...c, medidas: { ...c.medidas, tipoCuerpo: tipo } }));
  }

  cambiarTono(tono: string): void {
    this.actualizarCuerpo((c) => ({ ...c, tono }));
  }

  talla(item: PrendaArmario): string {
    const prenda = aPrenda3d(item);
    return prenda ? recomendarTalla(this.medidas(), prenda.categoria).talla : '';
  }

  // ------------------------------------------------------------------ apartados y armario

  cambiarGenero(genero: Genero): void {
    if (genero === this.genero()) return;
    this.genero.set(genero);
    this.filtro.set('todo');
    this.errorSubida.set(null);
    this.cargarArmario();
  }

  cargarArmario(): void {
    const genero = this.genero();
    this.cargandoArmario.set(true);
    this.armarioApi.listar(genero).subscribe({
      next: (items) => {
        if (genero !== this.genero()) return;
        this.armario.set(items);
        this.cargandoArmario.set(false);
        for (const item of items) if (item.status === 'processing') this.seguirPrenda(item.id);
      },
      error: () => this.cargandoArmario.set(false),
    });
  }

  /**
   * Sube una o varias fotos de prendas. Cada foto es una prenda independiente
   * con su propia tarjeta y su propio análisis (todas se suben en paralelo).
   */
  subirArchivos(archivos: FileList | File[] | null | undefined): void {
    this.errorSubida.set(null);
    // Copia inmediata: el FileList del <input> se vacía al reiniciar su valor.
    const lista = Array.from(archivos ?? []);
    const fotos = lista.filter(esImagen);
    if (!fotos.length) {
      if (lista.length) this.errorSubida.set('Elige una imagen (JPG, PNG, WEBP o HEIC).');
      return;
    }
    if (fotos.length > MAX_FOTOS_A_LA_VEZ) this.avisar(`Se subirán las primeras ${MAX_FOTOS_A_LA_VEZ} fotos.`);
    const genero = this.genero();
    const tipo = this.tipoSubida() ?? undefined;
    const lote = fotos.slice(0, MAX_FOTOS_A_LA_VEZ);
    this.filtro.set('todo');
    let pendientes = lote.length;
    let listas = 0;
    const terminar = () => {
      pendientes -= 1;
      if (pendientes === 0 && lote.length > 1) this.avisar(`${listas} de ${lote.length} prendas analizadas y guardadas en tu armario.`);
    };

    for (const archivo of lote) {
      if (archivo.size > MAX_BYTES_FOTO) {
        this.errorSubida.set(`"${archivo.name}" pesa más de 25 MB.`);
        terminar();
        continue;
      }
      this.subiendo.update((n) => n + 1);
      const sub = from(prepararFoto(archivo))
        .pipe(switchMap((blob) => this.armarioApi.subirFoto(blob, genero, { tipo })))
        .subscribe({
          next: (item) => {
            if (genero !== this.genero()) return;
            this.reemplazar(item);
            if (item.status === 'processing') return;
            if (item.status === 'ready' || item.status === 'review') listas += 1;
            if (item.status === 'failed') this.avisar(item.error ?? 'No se pudo analizar una de las fotos.');
            else {
              // Lista: se la pone el modelo. Con una sola foto se abre además su cuestionario.
              if (item.status === 'ready' && !this.estaSeleccionada(item.id)) this.alternarSeleccion(item);
              if (lote.length === 1) this.fichaId.set(item.id);
            }
          },
          error: (error: HttpErrorResponse) => {
            this.subiendo.update((n) => n - 1);
            this.errorSubida.set(`${lote.length > 1 ? `"${archivo.name}": ` : ''}${this.mensajeError(error)}`);
            terminar();
          },
          complete: () => {
            this.subiendo.update((n) => n - 1);
            terminar();
          },
        });
      this.seguimientos.add(sub);
    }
  }

  /** Cambia la foto de una prenda (p. ej. si el recorte salió mal). */
  cambiarFoto(item: PrendaArmario, archivos: FileList | null | undefined): void {
    const archivo = archivos?.[0];
    if (!archivo) return;
    const genero = this.genero();
    this.reemplazar({ ...item, status: 'processing' });
    from(prepararFoto(archivo))
      .pipe(switchMap((blob) => this.armarioApi.agregarFoto(item.id, blob)))
      .subscribe({
        next: (actualizada) => genero === this.genero() && this.reemplazar(actualizada),
        error: (error: HttpErrorResponse) => {
          this.reemplazar(item);
          this.avisar(this.mensajeError(error));
        },
      });
  }

  /** Quitar del armario: el primer clic pide confirmación, el segundo borra. */
  eliminar(item: PrendaArmario, evento?: Event): void {
    evento?.stopPropagation();
    if (this.porBorrar() !== item.id) {
      this.porBorrar.set(item.id);
      return;
    }
    this.porBorrar.set(null);
    this.armarioApi.eliminar(item.id).subscribe({
      next: () => {
        this.armario.update((lista) => lista.filter((p) => p.id !== item.id));
        this.quitarDeSeleccion(item.id);
        if (this.fichaId() === item.id) this.fichaId.set(null);
        this.avisar(`"${item.nombre ?? 'Prenda'}" se quitó de tu armario.`);
      },
      error: (error: HttpErrorResponse) => this.avisar(this.mensajeError(error)),
    });
  }

  cancelarBorrado(): void {
    this.porBorrar.set(null);
  }

  // ------------------------------------------------------------------ selección para probar

  estaSeleccionada(id: string): boolean {
    return this.seleccion().some((s) => s.id === id);
  }

  /**
   * Elige (o quita) una prenda para la prueba. Solo cabe una prenda por parte del
   * cuerpo: si eliges otra playera, sustituye a la anterior.
   */
  alternarSeleccion(item: PrendaArmario): void {
    if (this.estaSeleccionada(item.id)) return this.quitarDeSeleccion(item.id);
    if (item.status !== 'ready' || !item.category || item.category === 'outfit') {
      this.fichaId.set(item.id);
      return;
    }
    const nuevas = new Set(partesDe(item.category));
    const quedan = this.seleccion().filter((s) => {
      const otra = this.armario().find((p) => p.id === s.id);
      return !partesDe(otra?.category ?? null).some((parte) => nuevas.has(parte));
    });
    this.fijarPuesto([...quedan.map((s) => s.id), item.id]);
  }

  quitarDeSeleccion(id: string): void {
    this.fijarPuesto(this.seleccion().map((s) => s.id).filter((x) => x !== id));
  }

  quitarTodo(): void {
    this.fijarPuesto([]);
  }

  private fijarPuesto(ids: string[]): void {
    const genero = this.genero();
    this.puesto.update((todo) => ({ ...todo, [genero]: ids }));
  }

  // ------------------------------------------------------------------ cuestionario

  verFicha(item: PrendaArmario, evento?: Event): void {
    evento?.stopPropagation();
    this.fichaId.set(item.id);
  }

  cerrarFicha(): void {
    this.fichaId.set(null);
  }

  /** ¿El análisis propuso este tipo? (se resalta en el cuestionario). */
  sugerido(item: PrendaArmario, tipo: string): boolean {
    return item.analisis?.visual?.sugerencias?.slice(0, 3).includes(tipo) ?? false;
  }

  /** Respuesta actual: la del usuario o, si no hay, lo que se vio en la foto. */
  respuesta(item: PrendaArmario, clave: Exclude<keyof AjustesPrenda, 'usar'>): string | boolean | undefined {
    const guardada = item.ajustes?.[clave];
    if (guardada !== undefined) return guardada;
    if (clave === 'aspecto') return aPrenda3d({ ...item, status: 'ready' })?.aspecto;
    const visto = item.analisis?.visual?.detalle;
    if (clave === 'manga') return visto?.manga ?? undefined;
    if (clave === 'capucha') return visto?.capucha ?? (item.tipo === 'sudadera' ? true : undefined);
    if (clave === 'cuello') return ['camisa', 'chamarra', 'blazer', 'abrigo'].includes(item.tipo ?? '');
    if (clave === 'ajuste') return 'regular';
    if (clave === 'largo') return 'normal';
    return undefined;
  }

  /** Guarda una respuesta (tipo de prenda o cómo es) en el servidor. */
  responder(item: PrendaArmario, cambios: { tipo?: string; ajustes?: AjustesPrenda }): void {
    const categoria = cambios.tipo ? categoriaDeTipo(cambios.tipo) : item.category;
    if (!categoria) return;
    const ajustes = cambios.ajustes;
    const previa = item;
    this.reemplazar({
      ...item,
      category: categoria,
      tipo: cambios.tipo ?? item.tipo,
      status: 'ready',
      ajustes: ajustes ? { ...(item.ajustes ?? {}), ...ajustes } : item.ajustes,
    });
    // Si cambió de categoría, sale de la selección (podría chocar con otra prenda).
    if (categoria !== item.category) this.quitarDeSeleccion(item.id);
    this.armarioApi.clasificar(item.id, categoria, cambios.tipo, ajustes).subscribe({
      next: (actualizada) => this.reemplazar(actualizada),
      error: (error: HttpErrorResponse) => {
        this.reemplazar(previa);
        this.avisar(this.mensajeError(error));
      },
    });
  }

  confianza(item: PrendaArmario): string {
    const c = item.analisis?.confianza;
    return c === 'alta' ? 'Seguro' : c === 'media' ? 'Probable' : c === 'baja' ? 'Dudoso' : '';
  }

  // ------------------------------------------------------------------ interfaz

  avisar(mensaje: string): void {
    clearTimeout(this.notificacionTimer);
    this.notificacion.set(mensaje);
    this.notificacionTimer = setTimeout(() => this.notificacion.set(null), 4200);
  }

  // ------------------------------------------------------------------ privados

  private seguirPrenda(id: string): void {
    const genero = this.genero();
    const sub = this.armarioApi.seguir(id).subscribe({ next: (item) => genero === this.genero() && this.reemplazar(item), error: () => undefined });
    this.seguimientos.add(sub);
  }

  private reemplazar(item: PrendaArmario): void {
    this.armario.update((lista) => (lista.some((p) => p.id === item.id) ? lista.map((p) => (p.id === item.id ? item : p)) : [item, ...lista]));
  }

  private mensajeError(error: HttpErrorResponse): string {
    if (error.status === 0) return 'No se pudo conectar con el servidor. Verifica que el backend esté activo.';
    const detalles = error.error?.errors;
    if (Array.isArray(detalles) && detalles.length) return detalles.map((d: { message?: string }) => d.message).join(' · ');
    return error.error?.error ?? error.error?.message ?? 'Algo salió mal. Intenta de nuevo.';
  }

  private leer(clave: string): string | null {
    return this.leerJson<string>(clave);
  }

  private leerJson<T>(clave: string): T | null {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(clave) : null;
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private leerCuerpos(): Record<Genero, Cuerpo> {
    const guardados = this.leerJson<Partial<Record<Genero, Partial<Cuerpo>>>>(CLAVE_CUERPOS) ?? {};
    const cuerpo = (genero: Genero): Cuerpo => ({
      medidas: guardados[genero]?.medidas ? sanearMedidas({ ...guardados[genero]!.medidas!, genero }) : { ...MEDIDAS_INICIALES[genero] },
      tono: typeof guardados[genero]?.tono === 'string' ? guardados[genero]!.tono! : 'maniqui',
    });
    return { Femenino: cuerpo('Femenino'), Masculino: cuerpo('Masculino') };
  }

  private escribir(clave: string, valor: unknown): void {
    try {
      window.localStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      /* sin almacenamiento */
    }
  }
}
