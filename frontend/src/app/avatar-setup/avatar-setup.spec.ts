import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';

import { MEDIDAS_INICIALES } from '../probador/cuerpo';
import { MUESTRAS, PrendaEscaneada } from '../probador/prendas';
import { AuthResponse, AuthService, StoredSession } from '../servicios/auth.service';
import { PerfilProbador, PerfilService } from '../servicios/perfil.service';
import { RopaService } from '../servicios/ropa.service';
import { AvatarSetupComponent } from './avatar-setup';

const escaneo = (extra: Partial<PrendaEscaneada> = {}): PrendaEscaneada => ({
  id: 'scanned_1',
  nombre: 'Men Drawstring Sweatpants',
  categoria: 'Piernas',
  tipo: 'jogger',
  confianza: 'media',
  color: { nombre: 'gris', hex: '#8b8b88' },
  precio: null,
  marca: null,
  imagen: null,
  tienda: 'shop.example',
  fuente: 'url',
  motivo: null,
  ...extra,
});

describe('AvatarSetupComponent', () => {
  let fixture: ComponentFixture<AvatarSetupComponent>;
  let componente: AvatarSetupComponent;
  let sesion$: BehaviorSubject<StoredSession | null>;
  let auth: Partial<Record<keyof AuthService, unknown>> & { sesionActual: StoredSession | null };
  let perfil: { obtener: ReturnType<typeof vi.fn>; guardar: ReturnType<typeof vi.fn> };
  let ropa: { escanear: ReturnType<typeof vi.fn> };

  const sesion = (email: string, nombre = 'Michael'): StoredSession => ({
    sesionIniciada: true,
    email,
    token: 'token-demo',
    user: { id: 'u1', nombre, email },
  });
  const respuesta = (s: StoredSession): AuthResponse => ({
    status: 'success',
    data: { user: s.user!, token: s.token, expires_at: '2999-01-01T00:00:00Z', session_id: 's1' },
  });
  const iniciar = (s: StoredSession) => {
    auth.sesionActual = s;
    sesion$.next(s);
  };

  async function crear(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [AvatarSetupComponent],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: PerfilService, useValue: perfil },
        { provide: RopaService, useValue: ropa },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AvatarSetupComponent);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined); // sin WebGL en jsdom
    sesion$ = new BehaviorSubject<StoredSession | null>(null);
    auth = {
      sesion$: sesion$.asObservable(),
      sesionActual: null,
      refrescarSesion: () => undefined,
      obtenerToken: () => auth.sesionActual?.token ?? '',
      cabecerasAuth: () => new HttpHeaders(),
      registrar: ({ nombre, email }: { nombre: string; email: string }): Observable<AuthResponse> => {
        const s = sesion(email, nombre);
        iniciar(s);
        return of(respuesta(s));
      },
      iniciarSesion: ({ email }: { email: string }): Observable<AuthResponse> => {
        const s = sesion(email);
        iniciar(s);
        return of(respuesta(s));
      },
      cerrarSesion: () => {
        auth.sesionActual = null;
        localStorage.clear();
        sesion$.next(null);
      },
    };
    perfil = { obtener: vi.fn(() => of(null)), guardar: vi.fn(() => of({})) };
    ropa = { escanear: vi.fn(() => of(escaneo())) };
    await crear();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('arranca con medidas por defecto y el visor 3D', () => {
    expect(componente.medidas()).toMatchObject(MEDIDAS_INICIALES.Femenino);
    expect(fixture.nativeElement.querySelector('tr-visor-3d')).not.toBeNull();
    expect(texto()).toContain('Pruébatelo antes de comprarlo.');
  });

  it('ajusta altura y peso dentro de los límites y cambia el tipo de cuerpo', () => {
    componente.cambiarNumero('altura', 400);
    componente.cambiarNumero('peso', '72.5');
    componente.cambiarTipoCuerpo('ovalo');
    expect(componente.medidas()).toMatchObject({ altura: 210, peso: 72.5, tipoCuerpo: 'ovalo' });
  });

  it('al cambiar de género parte de proporciones típicas conservando altura y peso', () => {
    componente.cambiarNumero('altura', 180);
    componente.cambiarContorno('cintura', 70);
    componente.cambiarGenero('Masculino');
    expect(componente.medidas()).toMatchObject({ genero: 'Masculino', altura: 180, tipoCuerpo: 'rectangulo' });
    expect(componente.medidas().cintura).toBeUndefined();
  });

  it('las medidas exactas fuera de rango vuelven a la estimación', () => {
    componente.cambiarContorno('pecho', 92);
    expect(componente.contornos().pecho).toBe(92);
    componente.cambiarContorno('pecho', 900);
    expect(componente.medidas().pecho).toBeNull();
  });

  it('guarda medidas y conjunto en este dispositivo', () => {
    componente.cambiarNumero('altura', 170);
    componente.vestir(MUESTRAS[0]);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('trender.measurements')!).altura).toBe(170);
    expect(JSON.parse(localStorage.getItem('trender.outfit')!)).toHaveLength(1);
  });

  it('viste y quita básicos, y recomienda talla para cada prenda puesta', () => {
    componente.vestir(MUESTRAS.find((m) => m.id === 'm-camiseta')!);
    componente.vestir(MUESTRAS.find((m) => m.id === 'm-jeans')!);
    expect(componente.recomendaciones().map((r) => r.talla.talla)).toEqual(['M', 'L']);
    componente.quitar('m-camiseta');
    expect(componente.conjunto().map((p) => p.id)).toEqual(['m-jeans']);
  });

  it('escanea un link y viste la prenda detectada', () => {
    componente.urlEscaneo.set('https://shop.example/Men-Drawstring-Sweatpants-p-1.html');
    componente.escanearProducto();
    expect(ropa.escanear).toHaveBeenCalledWith('https://shop.example/Men-Drawstring-Sweatpants-p-1.html');
    expect(componente.conjunto()).toEqual([expect.objectContaining({ categoria: 'Piernas', tipo: 'jogger' })]);
    expect(componente.notificacion()?.mensaje).toContain('Probando');
  });

  it('si el escáner no reconoce la prenda, el usuario elige la categoría', () => {
    ropa.escanear.mockReturnValue(of(escaneo({ categoria: null, tipo: null, motivo: 'Elige la categoría.' })));
    componente.urlEscaneo.set('https://www2.hm.com/es_mx/productpage.1234.html');
    componente.escanearProducto();
    expect(componente.conjunto()).toEqual([]);
    componente.elegirCategoria('Calzado');
    expect(componente.conjunto()).toEqual([expect.objectContaining({ categoria: 'Calzado', tipo: 'tenis' })]);
  });

  it('valida el link antes de llamar al backend y muestra sus errores', () => {
    componente.urlEscaneo.set('zara pantalon');
    componente.escanearProducto();
    expect(ropa.escanear).not.toHaveBeenCalled();
    expect(componente.errorEscaneo()).toContain('https://');

    ropa.escanear.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { error: 'La URL apunta a una red interna' } }))
    );
    componente.urlEscaneo.set('http://192.168.0.2/x');
    componente.escanearProducto();
    expect(componente.errorEscaneo()).toBe('La URL apunta a una red interna');
    expect(componente.escaneando()).toBe(false);
  });

  it('crea la cuenta, muestra la confirmación y guarda las medidas actuales en ella', () => {
    componente.abrirAuthModal('registro');
    componente.nombreIngresado = 'Michael';
    componente.emailIngresado = 'michael@trender.test';
    componente.passwordIngresado = 'secreto-seguro';
    componente.registrarConPassword();

    expect(componente.registroExitoso()).toBe(true);
    expect(componente.sesionIniciada()).toBe(false);
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();

    expect(componente.sesionIniciada()).toBe(true);
    expect(componente.mostrarModalAuth).toBe(false);
    expect(texto()).toContain('Hola, Michael');
    expect(texto()).toContain('Mi Espacio de Medición');
    expect(perfil.guardar).toHaveBeenCalled();
  });

  it('valida nombre, correo y contraseña al registrarse', () => {
    componente.abrirAuthModal('registro');
    componente.emailIngresado = 'michael@trender.test';
    componente.passwordIngresado = 'secreto-seguro';
    componente.registrarConPassword();
    expect(componente.errorAuth()).toBe('Ingresa tu nombre.');
    componente.nombreIngresado = 'Michael';
    componente.passwordIngresado = 'corta';
    componente.registrarConPassword();
    expect(componente.errorAuth()).toBe('La contraseña debe tener al menos 8 caracteres.');
  });

  it('al iniciar sesión recupera medidas y conjunto de la cuenta sin reenviarlos', () => {
    const guardado: PerfilProbador = {
      medidas: { ...MEDIDAS_INICIALES.Masculino, altura: 188, peso: 85 },
      conjunto: [MUESTRAS.find((m) => m.id === 'm-abrigo')!],
    };
    perfil.obtener.mockReturnValue(of(guardado));
    componente.abrirAuthModal('login');
    componente.emailIngresado = 'michael@trender.test';
    componente.passwordIngresado = 'secreto-seguro';
    componente.iniciarSesionConPassword();
    TestBed.tick();
    vi.advanceTimersByTime(1000);

    expect(componente.medidas()).toMatchObject({ genero: 'Masculino', altura: 188, peso: 85 });
    expect(componente.conjunto().map((p) => p.id)).toEqual(['m-abrigo']);
    expect(perfil.guardar).not.toHaveBeenCalled();
  });

  it('muestra un error claro con credenciales inválidas', () => {
    auth.iniciarSesion = () => throwError(() => new HttpErrorResponse({ status: 401 }));
    componente.abrirAuthModal('login');
    componente.emailIngresado = 'michael@trender.test';
    componente.passwordIngresado = 'incorrecta-1';
    componente.iniciarSesionConPassword();
    expect(componente.errorAuth()).toBe('Credenciales inválidas. Revisa tu correo y contraseña.');
  });

  it('cerrar sesión reinicia el probador y no deja datos en el dispositivo', () => {
    iniciar(sesion('michael@trender.test'));
    componente.vestir(MUESTRAS[0]);
    componente.cambiarNumero('altura', 190);
    TestBed.tick();

    componente.cerrarSesion();
    TestBed.tick();
    fixture.detectChanges();

    expect(componente.sesionIniciada()).toBe(false);
    expect(componente.conjunto()).toEqual([]);
    expect(componente.medidas().altura).toBe(MEDIDAS_INICIALES.Femenino.altura);
    expect(localStorage.length).toBe(0);
    expect(texto()).not.toContain('Mi Espacio de Medición');
  });

  it('no usa "IA" en la interfaz ni expone acceso por código', () => {
    expect(texto()).not.toMatch(/\bIA\b|Inteligencia Artificial/);
    expect(fixture.nativeElement.querySelector('input[name="codigo"]')).toBeNull();
  });
});
