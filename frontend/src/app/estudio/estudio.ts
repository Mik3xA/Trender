import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { Subscription, from, switchMap } from 'rxjs';

import {
  AjustesPrenda,
  CategoriaArmario,
  NOMBRE_CATEGORIA,
  NOMBRE_PARTE,
  NOMBRE_TIPO,
  PARTES_OUTFIT,
  Parte,
  TIPOS_POR_CATEGORIA,
  categoriaDeTipo,
  partesDe,
} from '../probador/prendas';
import { ArmarioService, Genero, PrendaArmario, prepararFoto, urlPrenda } from '../servicios/armario.service';
import { ImagenesService } from '../servicios/imagenes.service';
import { FotoPersona, PersonaService } from '../servicios/persona.service';
import { EstadoIa, Prueba, PruebasService } from '../servicios/pruebas.service';
import { SesionService } from '../servicios/sesion.service';
import { TutorialService } from '../tutorial/tutorial.service';

type Filtro = 'todo' | CategoriaArmario;

interface Seleccion {
  id: string;
  /** Solo para outfits: qué partes usar. */
  usar?: Parte[];
}

const CLAVE_GENERO = 'trender.genero';
const CLAVE_PERSONA = 'trender.persona';
const MAX_FOTOS_A_LA_VEZ = 8;
const MAX_BYTES_FOTO = 25 * 1024 * 1024;

const esImagen = (f: File) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name);

/**
 * Probador con IA: tu foto (izquierda) + prendas de tu armario (derecha) ->
 * foto generada contigo puesta la ropa (centro). Mujer y Hombre tienen armarios
 * separados. No hay login: SesionService crea una sesión de invitado.
 */
@Component({
  selector: 'tr-estudio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './estudio.html',
})
export class EstudioComponent implements OnInit {
  private readonly armarioApi = inject(ArmarioService);
  private readonly personaApi = inject(PersonaService);
  private readonly pruebasApi = inject(PruebasService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly imagenes = inject(ImagenesService);
  protected readonly sesion = inject(SesionService);
  protected readonly tutorial = inject(TutorialService);

  protected readonly NOMBRE_TIPO = NOMBRE_TIPO;
  protected readonly NOMBRE_CATEGORIA = NOMBRE_CATEGORIA;
  protected readonly NOMBRE_PARTE = NOMBRE_PARTE;
  protected readonly urlPrenda = urlPrenda;
  protected readonly FILTROS: Array<{ id: Filtro; nombre: string }> = [
    { id: 'todo', nombre: 'Todo' },
    { id: 'top', nombre: 'Superior' },
    { id: 'bottom', nombre: 'Inferior' },
    { id: 'dress', nombre: 'Vestidos' },
    { id: 'shoes', nombre: 'Calzado' },
    { id: 'outfit', nombre: 'Outfits' },
  ];
  /** Atajos antes de subir ("¿Qué vas a subir?"). */
  protected readonly TIPOS_RAPIDOS = ['outfit', 'camiseta', 'camisa', 'sudadera', 'chamarra', 'pantalon', 'jeans', 'jogger', 'falda', 'vestido', 'tenis'];
  protected readonly GRUPOS_TIPO: Array<{ categoria: CategoriaArmario; nombre: string; tipos: string[] }> = [
    { categoria: 'outfit', nombre: 'Varias prendas', tipos: TIPOS_POR_CATEGORIA.outfit },
    { categoria: 'top', nombre: 'Superior', tipos: TIPOS_POR_CATEGORIA.top },
    { categoria: 'bottom', nombre: 'Inferior', tipos: TIPOS_POR_CATEGORIA.bottom },
    { categoria: 'dress', nombre: 'Vestido', tipos: TIPOS_POR_CATEGORIA.dress },
    { categoria: 'shoes', nombre: 'Calzado', tipos: TIPOS_POR_CATEGORIA.shoes },
  ];
  protected readonly PARTES_ELEGIBLES: Parte[] = ['top', 'bottom', 'dress', 'shoes'];
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

  // ---- tu foto
  readonly personas = signal<FotoPersona[]>([]);
  readonly personaId = signal<string | null>(this.leer(CLAVE_PERSONA));
  readonly persona = computed(() => this.personas().find((p) => p.id === this.personaId()) ?? this.personas()[0] ?? null);
  readonly subiendoPersona = signal(false);
  readonly arrastrandoPersona = signal(false);
  readonly errorPersona = signal<string | null>(null);

  // ---- selección y pruebas
  readonly seleccion = signal<Seleccion[]>([]);
  readonly seleccionadas = computed(() =>
    this.seleccion()
      .map((s) => ({ ...s, prenda: this.armario().find((p) => p.id === s.id) }))
      .filter((s): s is Seleccion & { prenda: PrendaArmario } => !!s.prenda)
  );
  readonly pruebas = signal<Prueba[]>([]);
  readonly pruebaId = signal<string | null>(null);
  readonly prueba = computed(() => this.pruebas().find((p) => p.id === this.pruebaId()) ?? null);
  readonly generando = signal(false);
  readonly errorPrueba = signal<string | null>(null);
  readonly estadoIa = signal<EstadoIa | null>(null);
  /** Comparar: ver la foto original en lugar del resultado. */
  readonly verOriginal = signal(false);
  readonly puedeGenerar = computed(() => !!this.persona() && this.seleccionadas().length > 0 && !this.generando());

  // ---- interfaz
  readonly notificacion = signal<string | null>(null);
  private readonly seguimientos = new Set<Subscription>();
  private notificacionTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => this.escribir(CLAVE_GENERO, this.genero()));
    effect(() => {
      const id = this.persona()?.id;
      if (id) this.escribir(CLAVE_PERSONA, id);
    });
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
    this.personaApi.listar().subscribe({ next: (fotos) => this.personas.set(fotos), error: () => undefined });
    this.pruebasApi.listar().subscribe({
      next: (lista) => {
        this.pruebas.set(lista);
        for (const p of lista) if (p.status === 'processing') this.seguirPrueba(p.id);
      },
      error: () => undefined,
    });
    this.pruebasApi.estado().subscribe({ next: (e) => this.estadoIa.set(e), error: () => undefined });
  }

  // ------------------------------------------------------------------ apartados y armario

  cambiarGenero(genero: Genero): void {
    if (genero === this.genero()) return;
    this.genero.set(genero);
    this.filtro.set('todo');
    this.seleccion.set([]);
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
            // Con una sola foto se abre el cuestionario para confirmar cómo es la prenda.
            else if (lote.length === 1) this.fichaId.set(item.id);
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
        this.seleccion.update((s) => s.filter((x) => x.id !== item.id));
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
    if (this.estaSeleccionada(item.id)) {
      this.seleccion.update((s) => s.filter((x) => x.id !== item.id));
      return;
    }
    if (item.status !== 'ready' || !item.category) {
      this.fichaId.set(item.id);
      return;
    }
    const usar = item.category === 'outfit' ? (item.ajustes?.usar ?? PARTES_OUTFIT) : undefined;
    const nuevas = new Set(partesDe(item.category, usar));
    const quedan = this.seleccion().filter((s) => {
      const otra = this.armario().find((p) => p.id === s.id);
      return !partesDe(otra?.category ?? null, s.usar).some((parte) => nuevas.has(parte));
    });
    const max = this.estadoIa()?.maxPrendas ?? 4;
    if (quedan.length >= max) {
      this.avisar(`Puedes probar hasta ${max} prendas a la vez.`);
      return;
    }
    const sustituidas = this.seleccion().length - quedan.length;
    this.seleccion.set([...quedan, { id: item.id, ...(usar ? { usar: [...usar] } : {}) }]);
    if (sustituidas) this.avisar(`"${item.nombre}" reemplaza a la prenda que ocupaba esa parte.`);
  }

  quitarDeSeleccion(id: string): void {
    this.seleccion.update((s) => s.filter((x) => x.id !== id));
  }

  /** Partes de un outfit elegido que se usan en la prueba (Todo / Arriba / Abajo / Calzado). */
  alternarParte(id: string, parte: Parte): void {
    this.seleccion.update((lista) =>
      lista.map((s) => {
        if (s.id !== id) return s;
        const actual = new Set(s.usar ?? PARTES_OUTFIT);
        if (actual.has(parte)) actual.delete(parte);
        else actual.add(parte);
        if (parte === 'dress' && actual.has('dress')) {
          actual.delete('top');
          actual.delete('bottom');
        }
        if ((parte === 'top' || parte === 'bottom') && actual.has(parte)) actual.delete('dress');
        return actual.size ? { ...s, usar: this.PARTES_ELEGIBLES.filter((p) => actual.has(p)) } : s;
      })
    );
  }

  usaParte(s: Seleccion, parte: Parte): boolean {
    return (s.usar ?? PARTES_OUTFIT).includes(parte);
  }

  // ------------------------------------------------------------------ tu foto

  subirPersona(archivos: FileList | File[] | null | undefined): void {
    this.errorPersona.set(null);
    const archivo = Array.from(archivos ?? []).find(esImagen);
    if (!archivo) {
      if (archivos?.length) this.errorPersona.set('Elige una imagen (JPG, PNG, WEBP o HEIC).');
      return;
    }
    this.subiendoPersona.set(true);
    from(prepararFoto(archivo))
      .pipe(switchMap((blob) => this.personaApi.subir(blob)))
      .subscribe({
        next: (foto) => {
          this.personas.update((lista) => [foto, ...lista]);
          this.personaId.set(foto.id);
          this.pruebaId.set(null);
          this.subiendoPersona.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.subiendoPersona.set(false);
          this.errorPersona.set(this.mensajeError(error));
        },
      });
  }

  elegirPersona(foto: FotoPersona): void {
    this.personaId.set(foto.id);
    // Si ya hay una prueba con esta foto, se muestra la más reciente.
    this.pruebaId.set(this.pruebas().find((p) => p.persona_id === foto.id && p.status !== 'failed')?.id ?? null);
  }

  eliminarPersona(foto: FotoPersona, evento?: Event): void {
    evento?.stopPropagation();
    this.personaApi.eliminar(foto.id).subscribe({
      next: () => {
        this.personas.update((lista) => lista.filter((p) => p.id !== foto.id));
        this.imagenes.olvidar(foto.imagen_url);
        if (this.personaId() === foto.id) this.personaId.set(this.personas()[0]?.id ?? null);
      },
      error: (error: HttpErrorResponse) => this.avisar(this.mensajeError(error)),
    });
  }

  // ------------------------------------------------------------------ generar

  generar(): void {
    const persona = this.persona();
    if (!persona || !this.seleccion().length || this.generando()) return;
    this.errorPrueba.set(null);
    this.generando.set(true);
    this.verOriginal.set(false);
    const sub = this.pruebasApi.crear(persona.id, this.seleccion()).subscribe({
      next: (prueba) => {
        this.reemplazarPrueba(prueba);
        this.pruebaId.set(prueba.id);
        if (prueba.status === 'failed') this.errorPrueba.set(prueba.error ?? 'No se pudo generar la prueba.');
      },
      error: (error: HttpErrorResponse) => {
        this.generando.set(false);
        this.errorPrueba.set(this.mensajeError(error));
      },
      complete: () => this.generando.set(false),
    });
    this.seguimientos.add(sub);
  }

  verPrueba(prueba: Prueba): void {
    this.pruebaId.set(prueba.id);
    this.verOriginal.set(false);
    if (prueba.persona_id && this.personas().some((p) => p.id === prueba.persona_id)) this.personaId.set(prueba.persona_id);
  }

  eliminarPrueba(prueba: Prueba, evento?: Event): void {
    evento?.stopPropagation();
    this.pruebasApi.eliminar(prueba.id).subscribe({
      next: () => {
        this.pruebas.update((lista) => lista.filter((p) => p.id !== prueba.id));
        if (prueba.imagen_url) this.imagenes.olvidar(prueba.imagen_url);
        if (this.pruebaId() === prueba.id) this.pruebaId.set(null);
      },
      error: (error: HttpErrorResponse) => this.avisar(this.mensajeError(error)),
    });
  }

  /** Vuelve a elegir las prendas de una prueba anterior. */
  repetir(prueba: Prueba): void {
    const disponibles = prueba.prendas.filter((p) => this.armario().some((a) => a.id === p.id));
    this.seleccion.set(disponibles.map((p) => ({ id: p.id, ...(p.usar ? { usar: p.usar } : {}) })));
    if (disponibles.length < prueba.prendas.length) this.avisar('Algunas prendas de esa prueba ya no están en este armario.');
  }

  descargar(prueba: Prueba): void {
    const url = this.imagenes.url(prueba.imagen_url);
    if (!url || typeof document === 'undefined') return;
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `trender-${prueba.id.slice(0, 8)}.jpg`;
    enlace.click();
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
    const visto = item.analisis?.visual?.detalle;
    if (clave === 'manga') return visto?.manga ?? undefined;
    if (clave === 'capucha') return visto?.capucha ?? (item.tipo === 'sudadera' ? true : undefined);
    if (clave === 'cuello') return ['camisa', 'chamarra', 'blazer', 'abrigo'].includes(item.tipo ?? '');
    if (clave === 'ajuste') return 'regular';
    if (clave === 'largo') return 'normal';
    return undefined;
  }

  usaDelOutfit(item: PrendaArmario, parte: Parte): boolean {
    return (item.ajustes?.usar ?? PARTES_OUTFIT).includes(parte);
  }

  /** Parte de un outfit en el cuestionario (qué se usará por defecto al probarlo). */
  alternarParteOutfit(item: PrendaArmario, parte: Parte): void {
    const actual = new Set(item.ajustes?.usar ?? PARTES_OUTFIT);
    if (actual.has(parte)) actual.delete(parte);
    else actual.add(parte);
    if (!actual.size) return;
    this.responder(item, { ajustes: { usar: this.PARTES_ELEGIBLES.filter((p) => actual.has(p)) } });
  }

  /** Guarda una respuesta (tipo de prenda o cómo es) en el servidor. */
  responder(item: PrendaArmario, cambios: { tipo?: string; ajustes?: AjustesPrenda }): void {
    const categoria = cambios.tipo ? categoriaDeTipo(cambios.tipo) : item.category;
    if (!categoria) return;
    const ajustes =
      cambios.tipo === 'outfit' && !item.ajustes?.usar ? { ...(cambios.ajustes ?? {}), usar: PARTES_OUTFIT } : cambios.ajustes;
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

  nombreProveedor(p: Prueba['proveedor'] | undefined): string {
    return p === 'gemini' ? 'Google Gemini' : p === 'fashn' ? 'FASHN' : 'Vista previa (sin IA)';
  }

  // ------------------------------------------------------------------ privados

  private seguirPrenda(id: string): void {
    const genero = this.genero();
    const sub = this.armarioApi.seguir(id).subscribe({ next: (item) => genero === this.genero() && this.reemplazar(item), error: () => undefined });
    this.seguimientos.add(sub);
  }

  private seguirPrueba(id: string): void {
    const sub = this.pruebasApi.seguir(id).subscribe({ next: (p) => this.reemplazarPrueba(p), error: () => undefined });
    this.seguimientos.add(sub);
  }

  private reemplazar(item: PrendaArmario): void {
    this.armario.update((lista) => (lista.some((p) => p.id === item.id) ? lista.map((p) => (p.id === item.id ? item : p)) : [item, ...lista]));
  }

  private reemplazarPrueba(prueba: Prueba): void {
    this.pruebas.update((lista) => (lista.some((p) => p.id === prueba.id) ? lista.map((p) => (p.id === prueba.id ? prueba : p)) : [prueba, ...lista]));
  }

  private mensajeError(error: HttpErrorResponse): string {
    if (error.status === 0) return 'No se pudo conectar con el servidor. Verifica que el backend esté activo.';
    const detalles = error.error?.errors;
    if (Array.isArray(detalles) && detalles.length) return detalles.map((d: { message?: string }) => d.message).join(' · ');
    return error.error?.error ?? error.error?.message ?? 'Algo salió mal. Intenta de nuevo.';
  }

  private leer(clave: string): string | null {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(clave) : null;
      return raw ? (JSON.parse(raw) as string) : null;
    } catch {
      return null;
    }
  }

  private escribir(clave: string, valor: unknown): void {
    try {
      window.localStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      /* sin almacenamiento */
    }
  }
}
