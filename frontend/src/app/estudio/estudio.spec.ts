import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

import { ArmarioService, PrendaArmario } from '../servicios/armario.service';
import { SesionService } from '../servicios/sesion.service';
import { TutorialService } from '../tutorial/tutorial.service';
import { EstudioComponent, aPrenda3d } from './estudio';

const prenda = (extra: Partial<PrendaArmario> = {}): PrendaArmario => ({
  id: 'p1',
  genero: 'Femenino',
  imagen_url: '/media/closet/u/p1.png',
  category: 'top',
  tipo: 'camiseta',
  nombre: 'Playera roja',
  color: '#b3282d',
  status: 'ready',
  error: null,
  ajustes: null,
  analisis: { confianza: 'alta', evidencias: ['foto: mangas'], avisos: [], metodoRecorte: 'recorte-local' },
  created_at: '2026-11-12T00:00:00Z',
  ...extra,
});
const foto = (nombre = 'a.jpg') => new File([new Uint8Array([1, 2, 3])], nombre, { type: 'image/jpeg' });

describe('EstudioComponent (probador 3D)', () => {
  let fixture: ComponentFixture<EstudioComponent>;
  let c: EstudioComponent;
  let armario: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('trender.tutorial', 'visto');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined); // sin WebGL en jsdom
    armario = { listar: vi.fn(() => of([])), subirFoto: vi.fn(), agregarFoto: vi.fn(), seguir: vi.fn(() => of()), clasificar: vi.fn(), eliminar: vi.fn(() => of({})) };
    await TestBed.configureTestingModule({ imports: [EstudioComponent], providers: [{ provide: ArmarioService, useValue: armario }] }).compileComponents();
    fixture = TestBed.createComponent(EstudioComponent);
    c = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const cargar = (items: PrendaArmario[]) => {
    armario['listar'].mockReturnValue(of(items));
    c.cargarArmario();
    fixture.detectChanges();
  };

  it('tres columnas: tu modelo, visor 3D y armario', () => {
    for (const objetivo of ['apartados', 'persona', 'importar', 'armario', 'resultado']) {
      expect(fixture.nativeElement.querySelector(`[data-tutorial="${objetivo}"]`)).not.toBeNull();
    }
    expect(fixture.nativeElement.querySelector('tr-visor-3d')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Tipo de cuerpo');
  });

  it('Mujer y Hombre tienen modelo, conjunto y armario separados', () => {
    cargar([prenda({ id: 't1' })]);
    c.alternarSeleccion(c.armario()[0]);
    c.cambiarTipoCuerpo('fit');
    expect(c.medidas()).toMatchObject({ genero: 'Femenino', tipoCuerpo: 'fit' });
    expect(c.conjunto().map((p) => p.id)).toEqual(['t1']);

    c.cambiarGenero('Masculino');
    expect(armario['listar']).toHaveBeenLastCalledWith('Masculino');
    expect(c.medidas().genero).toBe('Masculino');
    expect(c.medidas().tipoCuerpo).not.toBe('fit');
    expect(c.conjunto()).toEqual([]);
    expect(c.medidas().altura).toBeGreaterThan(165); // el modelo de hombre es más alto por defecto

    cargar([prenda({ id: 't1' })]);
    c.cambiarGenero('Femenino');
    cargar([prenda({ id: 't1' })]);
    expect(c.conjunto().map((p) => p.id)).toEqual(['t1']); // se conserva lo que llevaba puesto
  });

  it('subir VARIAS fotos crea una prenda por foto y el modelo se las pone', async () => {
    const tipos: Array<Partial<PrendaArmario>> = [
      { category: 'top', tipo: 'chamarra' },
      { category: 'bottom', tipo: 'jeans' },
      { category: 'shoes', tipo: 'tenis' },
    ];
    let n = 0;
    armario['subirFoto'].mockImplementation(() => {
      const extra = { id: `p${n + 1}`, ...tipos[n] };
      n += 1;
      return of(prenda({ ...extra, status: 'processing' }), prenda(extra));
    });
    c.subirArchivos([foto('a.jpg'), foto('b.jpg'), foto('c.jpg'), new File(['x'], 'notas.txt', { type: 'text/plain' })]);
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(armario['subirFoto']).toHaveBeenCalledTimes(3);
    expect(fixture.nativeElement.querySelectorAll('[data-prenda]').length).toBe(3);
    expect(c.conjunto().map((p) => p.tipo).sort()).toEqual(['chamarra', 'jeans', 'tenis']);
    expect(c.notificacion()).toContain('3 de 3 prendas');
  });

  it('una prenda por parte del cuerpo: otra chamarra reemplaza a la camisa; un vestido ocupa arriba y abajo', () => {
    cargar([
      prenda({ id: 't1', tipo: 'camisa' }),
      prenda({ id: 't2', tipo: 'chamarra' }),
      prenda({ id: 'b1', category: 'bottom', tipo: 'jeans' }),
      prenda({ id: 's1', category: 'shoes', tipo: 'tenis' }),
      prenda({ id: 'd1', category: 'dress', tipo: 'vestido' }),
    ]);
    const [t1, t2, b1, s1, d1] = c.armario();
    for (const p of [t1, b1, s1, t2]) c.alternarSeleccion(p);
    expect(c.seleccion().map((s) => s.id)).toEqual(['b1', 's1', 't2']);
    c.alternarSeleccion(d1);
    expect(c.seleccion().map((s) => s.id)).toEqual(['s1', 'd1']);
    expect(c.talla(s1)).not.toBe('');
  });

  it('quitar del armario pide confirmación y también se la quita al modelo', () => {
    cargar([prenda({ id: 't1' })]);
    c.alternarSeleccion(c.armario()[0]);
    const boton = () => fixture.nativeElement.querySelector('[data-borrar]') as HTMLButtonElement;
    boton().click();
    fixture.detectChanges();
    expect(armario['eliminar']).not.toHaveBeenCalled();
    boton().click();
    expect(armario['eliminar']).toHaveBeenCalledWith('t1');
    expect(c.armario()).toEqual([]);
    expect(c.conjunto()).toEqual([]);
  });

  it('cuestionario: tipo, ajuste y aspecto cambian la prenda 3D', () => {
    const item = prenda({ id: 't1', tipo: 'sueter' });
    cargar([item]);
    let servidor = item;
    armario['clasificar'].mockImplementation((id: string, category: string, tipo?: string, ajustes?: object) => {
      servidor = { ...servidor, category: category as PrendaArmario['category'], tipo: tipo ?? servidor.tipo, ajustes: { ...(servidor.ajustes ?? {}), ...(ajustes ?? {}) } };
      return of(servidor);
    });
    c.alternarSeleccion(item);
    c.responder(c.armario()[0], { tipo: 'chamarra' });
    c.responder(c.armario()[0], { ajustes: { ajuste: 'holgado', aspecto: 'foto' } });
    expect(armario['clasificar']).toHaveBeenLastCalledWith('t1', 'top', undefined, { ajuste: 'holgado', aspecto: 'foto' });
    expect(c.conjunto()[0]).toMatchObject({ tipo: 'chamarra', aspecto: 'foto', ajustes: { ajuste: 'holgado' } });
  });

  it('una prenda lisa usa color y tejido; con rayas, la foto', () => {
    expect(aPrenda3d(prenda())?.aspecto).toBe('tela');
    const rayas = prenda({ analisis: { confianza: 'alta', evidencias: [], avisos: [], metodoRecorte: null, visual: { categoria: 'Torso', tipo: 'camiseta', confianza: 'alta', nombreSugerido: null, detalle: { manga: 'corta', largo: null, tela: null, estampado: 'rayas horizontales', colores: [] } } } });
    expect(aPrenda3d(rayas)).toMatchObject({ aspecto: 'foto', ajustes: { manga: 'corta' } });
    expect(aPrenda3d(prenda({ status: 'review' }))).toBeNull();
  });

  it('muestra errores del servidor al subir y avisa sin conexión', async () => {
    armario['subirFoto'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { error: 'Esta foto ya está en tu armario' } })));
    c.subirArchivos([foto()]);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.errorSubida()).toBe('Esta foto ya está en tu armario');
    TestBed.inject(SesionService).conectado.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-sin-conexion]')).not.toBeNull();
  });

  it('el botón "?" inicia el tutorial', () => {
    (fixture.nativeElement.querySelector('[aria-label="Ver tutorial"]') as HTMLButtonElement).click();
    expect(TestBed.inject(TutorialService).activo()).toBe(true);
  });
});
