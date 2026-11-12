import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

import { ArmarioService, PrendaArmario } from '../servicios/armario.service';
import { ImagenesService } from '../servicios/imagenes.service';
import { PersonaService } from '../servicios/persona.service';
import { Prueba, PruebasService } from '../servicios/pruebas.service';
import { SesionService } from '../servicios/sesion.service';
import { TutorialService } from '../tutorial/tutorial.service';
import { EstudioComponent } from './estudio';

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

describe('EstudioComponent (probador con IA)', () => {
  let fixture: ComponentFixture<EstudioComponent>;
  let c: EstudioComponent;
  let armario: Record<string, ReturnType<typeof vi.fn>>;
  let persona: Record<string, ReturnType<typeof vi.fn>>;
  let pruebas: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('trender.tutorial', 'visto');
    armario = { listar: vi.fn(() => of([])), subirFoto: vi.fn(), agregarFoto: vi.fn(), seguir: vi.fn(() => of()), clasificar: vi.fn(), eliminar: vi.fn(() => of({})) };
    persona = { listar: vi.fn(() => of([])), subir: vi.fn(), eliminar: vi.fn(() => of({})) };
    pruebas = {
      listar: vi.fn(() => of([])),
      estado: vi.fn(() => of({ proveedor: 'local', ia: false, maxPrendas: 4, maxFotos: 12 })),
      crear: vi.fn(),
      seguir: vi.fn(() => of()),
      eliminar: vi.fn(() => of({})),
    };
    await TestBed.configureTestingModule({
      imports: [EstudioComponent],
      providers: [
        { provide: ArmarioService, useValue: armario },
        { provide: PersonaService, useValue: persona },
        { provide: PruebasService, useValue: pruebas },
        { provide: ImagenesService, useValue: { url: () => null, olvidar: vi.fn() } },
      ],
    }).compileComponents();
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

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const cargar = (items: PrendaArmario[]) => {
    armario['listar'].mockReturnValue(of(items));
    c.cargarArmario();
    fixture.detectChanges();
  };

  it('tres columnas: tu foto, resultado y armario; sin medidas ni 3D', () => {
    for (const objetivo of ['persona', 'importar', 'armario', 'generar', 'resultado']) {
      expect(fixture.nativeElement.querySelector(`[data-tutorial="${objetivo}"]`)).not.toBeNull();
    }
    expect(texto()).not.toMatch(/Altura|Peso|Tipo de cuerpo|3D/);
    expect(texto()).toContain('Vista previa sin IA');
    expect(texto()).toContain('Sube tu foto para empezar');
  });

  it('subir VARIAS fotos crea una prenda por foto (no solo una)', async () => {
    let n = 0;
    armario['subirFoto'].mockImplementation(() => {
      n += 1;
      return of(prenda({ id: `p${n}`, nombre: `Prenda ${n}`, status: 'processing' }), prenda({ id: `p${n}`, nombre: `Prenda ${n}` }));
    });
    c.subirArchivos([foto('a.jpg'), foto('b.jpg'), foto('c.jpg'), new File(['x'], 'notas.txt', { type: 'text/plain' })]);
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(armario['subirFoto']).toHaveBeenCalledTimes(3);
    expect(c.armario().map((p) => p.id).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(fixture.nativeElement.querySelectorAll('[data-prenda]').length).toBe(3);
    expect(c.notificacion()).toContain('3 de 3 prendas');
    expect(c.subiendo()).toBe(0);
  });

  it('con una sola foto se abre el cuestionario; "Outfit completo" se envía como tipo', async () => {
    armario['subirFoto'].mockReturnValue(of(prenda({ id: 'o1', category: 'outfit', tipo: 'outfit', nombre: 'Outfit completo' })));
    c.tipoSubida.set('outfit');
    c.subirArchivos([foto()]);
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(armario['subirFoto']).toHaveBeenCalledWith(expect.anything(), 'Femenino', { tipo: 'outfit' });
    expect(fixture.nativeElement.querySelector('[data-ficha]')?.textContent).toContain('¿Qué quieres usar de este outfit?');
  });

  it('una prenda por parte del cuerpo: otra playera reemplaza a la anterior; un vestido ocupa arriba y abajo', () => {
    cargar([
      prenda({ id: 't1', nombre: 'Playera' }),
      prenda({ id: 't2', nombre: 'Sudadera', tipo: 'sudadera' }),
      prenda({ id: 'b1', nombre: 'Jeans', category: 'bottom', tipo: 'jeans' }),
      prenda({ id: 'd1', nombre: 'Vestido', category: 'dress', tipo: 'vestido' }),
    ]);
    const [t1, t2, b1, d1] = c.armario();
    c.alternarSeleccion(t1);
    c.alternarSeleccion(b1);
    c.alternarSeleccion(t2);
    expect(c.seleccion().map((s) => s.id)).toEqual(['b1', 't2']);
    expect(c.notificacion()).toContain('reemplaza');
    c.alternarSeleccion(d1);
    expect(c.seleccion().map((s) => s.id)).toEqual(['d1']);
    c.alternarSeleccion(d1);
    expect(c.seleccion()).toEqual([]);
  });

  it('de un outfit se puede usar solo una parte y combinarla', () => {
    cargar([prenda({ id: 'o1', category: 'outfit', tipo: 'outfit', ajustes: { usar: ['top', 'bottom', 'shoes'] } }), prenda({ id: 's1', category: 'shoes', tipo: 'tenis' })]);
    const [outfit, tenis] = c.armario();
    c.alternarSeleccion(outfit);
    c.alternarSeleccion(tenis); // choca con el calzado del outfit: lo reemplaza
    expect(c.seleccion().map((s) => s.id)).toEqual(['s1']);
    c.alternarSeleccion(outfit);
    expect(c.seleccion().map((s) => s.id)).toEqual(['o1']);
    c.alternarParte('o1', 'bottom');
    c.alternarParte('o1', 'shoes');
    expect(c.seleccion()[0].usar).toEqual(['top']);
    c.alternarSeleccion(tenis);
    expect(c.seleccion().map((s) => s.id)).toEqual(['o1', 's1']);
  });

  it('quitar del armario pide confirmación y también la saca de la prueba', () => {
    cargar([prenda({ id: 't1' })]);
    c.alternarSeleccion(c.armario()[0]);
    const boton = () => fixture.nativeElement.querySelector('[data-borrar]') as HTMLButtonElement;
    boton().click();
    fixture.detectChanges();
    expect(armario['eliminar']).not.toHaveBeenCalled();
    expect(boton().textContent).toContain('Quitar');
    boton().click();
    fixture.detectChanges();
    expect(armario['eliminar']).toHaveBeenCalledWith('t1');
    expect(c.armario()).toEqual([]);
    expect(c.seleccion()).toEqual([]);
    expect(c.notificacion()).toContain('se quitó de tu armario');
  });

  it('sube tu foto, genera la prueba con las prendas elegidas y la muestra', async () => {
    persona['subir'].mockReturnValue(of({ id: 'f1', ancho: 600, alto: 900, imagen_url: '/api/persona/f1/imagen', created_at: '' }));
    c.subirPersona([foto('yo.jpg')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.persona()?.id).toBe('f1');

    cargar([prenda({ id: 't1' })]);
    expect(c.puedeGenerar()).toBe(false);
    c.alternarSeleccion(c.armario()[0]);
    expect(c.puedeGenerar()).toBe(true);
    const lista: Prueba = {
      id: 'x1', persona_id: 'f1', prendas: [], status: 'ready', proveedor: 'local', avisos: ['Vista previa sin IA'], error: null, imagen_url: '/api/pruebas/x1/imagen', created_at: '',
    };
    pruebas['crear'].mockReturnValue(of({ ...lista, status: 'processing', imagen_url: null }, lista));
    c.generar();
    fixture.detectChanges();
    expect(pruebas['crear']).toHaveBeenCalledWith('f1', [{ id: 't1' }]);
    expect(c.prueba()?.id).toBe('x1');
    expect(c.generando()).toBe(false);
    expect(texto()).toContain('Vista previa sin IA');
    expect(fixture.nativeElement.querySelector('.historial')).not.toBeNull();
  });

  it('muestra el error del servidor al generar', () => {
    persona['listar'].mockReturnValue(of([{ id: 'f1', ancho: 1, alto: 1, imagen_url: '/api/persona/f1/imagen', created_at: '' }]));
    c.ngOnInit();
    cargar([prenda({ id: 't1' })]);
    c.alternarSeleccion(c.armario()[0]);
    pruebas['crear'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 429, error: { error: 'Demasiadas pruebas seguidas' } })));
    c.generar();
    expect(c.errorPrueba()).toBe('Demasiadas pruebas seguidas');
    expect(c.generando()).toBe(false);
  });

  it('si la foto parece un outfit, el cuestionario lo pregunta', () => {
    const item = prenda({ id: 'o2', analisis: { confianza: 'media', evidencias: [], avisos: ['Parece un outfit completo'], metodoRecorte: 'recorte-local', posibleOutfit: true } });
    cargar([item]);
    armario['clasificar'].mockReturnValue(of({ ...item, category: 'outfit', tipo: 'outfit', ajustes: { usar: ['top', 'bottom', 'shoes'] } }));
    c.verFicha(item);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-ficha]')?.textContent).toContain('¿Es un outfit completo?');
    c.responder(item, { tipo: 'outfit' });
    expect(armario['clasificar']).toHaveBeenCalledWith('o2', 'outfit', 'outfit', { usar: ['top', 'bottom', 'shoes'] });
    expect(c.armario()[0].category).toBe('outfit');
  });

  it('avisa cuando no hay conexión con el backend', () => {
    TestBed.inject(SesionService).conectado.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-sin-conexion]')?.textContent).toContain('npm run dev');
  });

  it('el botón "?" inicia el tutorial', () => {
    (fixture.nativeElement.querySelector('[aria-label="Ver tutorial"]') as HTMLButtonElement).click();
    expect(TestBed.inject(TutorialService).activo()).toBe(true);
  });
});
