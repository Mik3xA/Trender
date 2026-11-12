import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';

import { MEDIDAS_INICIALES } from '../probador/cuerpo';
import { MUESTRAS } from '../probador/prendas';
import { ArmarioService, PrendaArmario } from '../servicios/armario.service';
import { PerfilService } from '../servicios/perfil.service';
import { SesionService } from '../servicios/sesion.service';
import { TutorialService } from '../tutorial/tutorial.service';
import { AvatarSetupComponent } from './avatar-setup';

const prenda = (extra: Partial<PrendaArmario> = {}): PrendaArmario => ({
  id: 'p1',
  genero: 'Masculino',
  source_url: 'https://tienda.example/sweatpants',
  imagen_url: '/media/closet/u/p1.png',
  category: 'bottom',
  tipo: 'jogger',
  nombre: 'Sweatpants gris',
  color: '#8b8b88',
  tienda: 'tienda.example',
  precio: '$599 MXN',
  status: 'ready',
  error: null,
  analisis: { confianza: 'alta', evidencias: ['título del producto: jogger'], avisos: [], metodoRecorte: 'recorte-local' },
  created_at: '2026-11-11T00:00:00Z',
  ...extra,
});

describe('AvatarSetupComponent', () => {
  let fixture: ComponentFixture<AvatarSetupComponent>;
  let c: AvatarSetupComponent;
  let armario: Record<string, ReturnType<typeof vi.fn>>;
  let perfil: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined); // sin WebGL en jsdom
    armario = {
      listar: vi.fn(() => of([])),
      importar: vi.fn(),
      seguir: vi.fn(() => of()),
      clasificar: vi.fn(),
      eliminar: vi.fn(() => of({})),
    };
    perfil = { obtener: vi.fn(() => of({ activo: null, perfiles: {} })), guardar: vi.fn(() => of({})) };
    await TestBed.configureTestingModule({
      imports: [AvatarSetupComponent],
      providers: [
        { provide: ArmarioService, useValue: armario },
        { provide: PerfilService, useValue: perfil },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AvatarSetupComponent);
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

  it('abre directo en el estudio, sin pantalla de inicio de sesión', () => {
    expect(texto()).toContain('TRENDER');
    expect(texto()).not.toMatch(/Iniciar sesión|Crear cuenta|Contraseña/);
    expect(fixture.nativeElement.querySelector('tr-visor-3d')).not.toBeNull();
    expect(armario['listar']).toHaveBeenCalledWith('Femenino');
  });

  it('Mujer y Hombre son apartados con cuerpo, conjunto y armario propios', () => {
    c.cambiarNumero('altura', 170);
    c.vestir(MUESTRAS[0]);
    c.cambiarGenero('Masculino');
    expect(armario['listar']).toHaveBeenLastCalledWith('Masculino');
    expect(c.medidas()).toMatchObject({ genero: 'Masculino', altura: MEDIDAS_INICIALES.Masculino.altura });
    expect(c.conjunto()).toEqual([]);
    c.cambiarGenero('Femenino');
    expect(c.medidas().altura).toBe(170);
    expect(c.conjunto().map((p) => p.id)).toEqual([MUESTRAS[0].id]);
  });

  it('tipos de cuerpo fit, delgado, normal y sobrepeso, y tono de piel', () => {
    fixture.detectChanges();
    for (const nombre of ['Fit', 'Delgado', 'Normal', 'Sobrepeso']) expect(texto()).toContain(nombre);
    c.cambiarTipoCuerpo('sobrepeso');
    c.cambiarTono('moreno');
    expect(c.medidas().tipoCuerpo).toBe('sobrepeso');
    expect(c.tono()).toBe('moreno');
  });

  it('importa un link: la tarjeta aparece "processing" y al quedar lista se viste', () => {
    const progreso = new Subject<PrendaArmario>();
    armario['importar'].mockReturnValue(progreso);
    c.cambiarGenero('Masculino');
    c.enlace.set('https://tienda.example/sweatpants');
    c.importar();
    expect(armario['importar']).toHaveBeenCalledWith('https://tienda.example/sweatpants', 'Masculino');

    progreso.next(prenda({ status: 'processing', category: null, tipo: null }));
    fixture.detectChanges();
    expect(texto()).toContain('Analizando');
    expect(c.conjunto()).toEqual([]);

    progreso.next(prenda());
    progreso.complete();
    fixture.detectChanges();
    expect(c.conjunto()).toEqual([expect.objectContaining({ id: 'p1', categoria: 'Piernas', tipo: 'jogger' })]);
    expect(c.notificacion()).toContain('Inferior · jogger');
    expect(c.importando()).toBe(0);
  });

  it('si la prenda queda en revisión, el usuario elige la categoría y se viste', () => {
    armario['importar'].mockReturnValue(of(prenda({ status: 'review', category: null, tipo: null })));
    armario['clasificar'].mockReturnValue(of(prenda({ category: 'shoes', tipo: 'tenis' })));
    c.enlace.set('https://tienda.example/p/1');
    c.importar();
    expect(c.conjunto()).toEqual([]);
    expect(c.notificacion()).toContain('elige qué es');

    c.clasificar(c.armario()[0], 'shoes');
    expect(armario['clasificar']).toHaveBeenCalledWith('p1', 'shoes', 'tenis');
    expect(c.conjunto()).toEqual([expect.objectContaining({ categoria: 'Calzado' })]);
  });

  it('valida el link y muestra errores del backend', () => {
    c.enlace.set('pantalon zara');
    c.importar();
    expect(armario['importar']).not.toHaveBeenCalled();
    expect(c.errorImportacion()).toContain('https://');

    armario['importar'].mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { error: 'Esta prenda ya está en tu armario' } })));
    c.enlace.set('https://tienda.example/x');
    c.importar();
    expect(c.errorImportacion()).toBe('Esta prenda ya está en tu armario');
  });

  it('un clic en el armario aplica la prenda y otro la quita; borrar la quita del avatar', () => {
    armario['listar'].mockReturnValue(of([prenda()]));
    c.cargarArmario();
    c.alternar(c.armario()[0]);
    expect(c.estaPuesta('p1')).toBe(true);
    c.alternar(c.armario()[0]);
    expect(c.estaPuesta('p1')).toBe(false);
    c.alternar(c.armario()[0]);
    c.eliminar(c.armario()[0]);
    expect(c.armario()).toEqual([]);
    expect(c.estaPuesta('p1')).toBe(false);
  });

  it('retoma las importaciones que seguían en curso al recargar', () => {
    armario['listar'].mockReturnValue(of([prenda({ status: 'processing' })]));
    c.cargarArmario();
    expect(armario['seguir']).toHaveBeenCalledWith('p1');
  });

  it('guarda los perfiles en el navegador y en el servidor con retardo', () => {
    c.cambiarNumero('peso', 61);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('trender.perfiles')!).Femenino.medidas.peso).toBe(61);
    vi.advanceTimersByTime(800);
    expect(perfil['guardar']).toHaveBeenCalledWith('Femenino', expect.objectContaining({ Femenino: expect.anything() }));
  });

  it('el panel lateral se puede colapsar', () => {
    c.alternarPanel();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('aside')).toBeNull();
  });

  it('no usa "IA" en la interfaz', () => {
    expect(texto()).not.toMatch(/\bIA\b|Inteligencia Artificial/);
  });

  it('avisa cuando no hay conexión con el backend', () => {
    expect(fixture.nativeElement.querySelector('[data-sin-conexion]')).toBeNull();
    TestBed.inject(SesionService).conectado.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-sin-conexion]')?.textContent).toContain('npm run dev');
  });

  it('marca los pasos del tutorial y abre el panel al iniciarlo', () => {
    for (const objetivo of ['apartados', 'cuerpo', 'importar', 'armario', 'visor', 'talla']) {
      expect(fixture.nativeElement.querySelector(`[data-tutorial="${objetivo}"]`)).not.toBeNull();
    }
    c.alternarPanel();
    fixture.detectChanges();
    TestBed.inject(TutorialService).iniciar();
    fixture.detectChanges();
    expect(c.panelAbierto()).toBe(true);
    expect(fixture.nativeElement.querySelector('aside')).not.toBeNull();
  });
});
