import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { AvatarSetupComponent } from './avatar-setup';
import { AuthResponse, AuthService, StoredSession } from '../servicios/auth.service';
import { environment } from '../../environments/environment';

describe('AvatarSetupComponent', () => {
  let fixture: ComponentFixture<AvatarSetupComponent>;
  let component: AvatarSetupComponent;
  let sesionSubject: BehaviorSubject<StoredSession | null>;
  let authMock: {
    sesion$: Observable<StoredSession | null>;
    sesionActual: StoredSession | null;
    refrescarSesion: () => void;
    registrar: (payload: { nombre?: string; email: string; password: string }) => Observable<AuthResponse>;
    iniciarSesion: (payload: { email: string; password: string }) => Observable<AuthResponse>;
    obtenerPerfil: () => Observable<{ status: string; user: { id: string; nombre: string; email: string; medidas?: any } }>;
    cerrarSesion: () => void;
    obtenerToken: () => string;
  };

  function crearSesion(email: string, metodo: StoredSession['metodo']): StoredSession {
    return {
      sesionIniciada: true,
      email,
      metodo,
      token: `token-${metodo}`,
      user: { id: `user-${metodo}`, nombre: 'Usuario Demo', email }
    };
  }

  function persistirSesion(sesion: StoredSession): void {
    authMock.sesionActual = sesion;
    localStorage.setItem('trender.auth', JSON.stringify(sesion));
    sesionSubject.next(sesion);
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    localStorage.clear();
    sesionSubject = new BehaviorSubject<StoredSession | null>(null);

    authMock = {
      sesion$: sesionSubject.asObservable(),
      sesionActual: null,
      refrescarSesion: () => undefined,
      obtenerToken: () => 'test-token',
      registrar: ({ nombre, email }) => {
        const sesion = crearSesion(email, 'password');
        sesion.user!.nombre = nombre || 'Usuario Demo';
        persistirSesion(sesion);
        return of({ status: 'success', token: sesion.token, user: sesion.user! });
      },
      iniciarSesion: ({ email }) => {
        const sesion = crearSesion(email, 'password');
        persistirSesion(sesion);
        return of({ status: 'success', token: sesion.token, user: sesion.user! });
      },
      obtenerPerfil: () =>
        of({
          status: 'success',
          user: { id: 'user-password', nombre: 'Usuario Demo', email: 'demo@trender.com', medidas: null }
        }),
      cerrarSesion: () => {
        authMock.sesionActual = null;
        localStorage.removeItem('trender.auth');
        sesionSubject.next(null);
      }
    };

    await TestBed.configureTestingModule({
      imports: [AvatarSetupComponent],
      providers: [provideHttpClient(), { provide: AuthService, useValue: authMock }]
    }).compileComponents();

    fixture = TestBed.createComponent(AvatarSetupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('abre el modal de inicio de sesión', () => {
    component.abrirAuthModal('login');

    expect(component.mostrarModalAuth).toBe(true);
    expect(component.modoAuth).toBe('login');
    expect(component.tipoAccionAuth).toBe('login');
  });

  it('muestra la pantalla de éxito antes de cerrar el modal de registro', () => {
    component.abrirAuthModal('registro');
    component.nombreIngresado = 'Michael';
    component.emailIngresado = 'michael@trender.com';
    component.passwordIngresado = 'secreto-seguro';

    component.registrarConPassword();

    expect(component.registroExitoso).toBe(true);
    expect(component.nombreRegistrado).toBe('Michael');
    expect(component.mostrarModalAuth).toBe(true);
    expect(component.sesionIniciada).toBe(false);

    vi.advanceTimersByTime(2000);

    expect(component.registroExitoso).toBe(false);
    expect(component.mostrarModalAuth).toBe(false);
    expect(component.sesionIniciada).toBe(true);
    expect(component.nombreAutenticado).toBe('Michael');
  });

  it('inicia sesión con correo y contraseña', () => {
    component.abrirAuthModal('login');
    component.emailIngresado = 'clasica@trender.com';
    component.passwordIngresado = 'secreto-seguro';

    component.iniciarSesionConPassword();

    expect(component.sesionIniciada).toBe(true);
    expect(component.mostrarModalAuth).toBe(false);
    expect(component.emailAutenticado).toBe('clasica@trender.com');
  });

  it('crea una cuenta clásica con contraseña', () => {
    component.abrirAuthModal('registro');
    component.nombreIngresado = 'Estudio Trender';
    component.emailIngresado = 'clasica@trender.com';
    component.passwordIngresado = 'secreto-seguro';

    component.registrarConPassword();
    vi.advanceTimersByTime(2000);

    expect(component.sesionIniciada).toBe(true);
    expect(component.mostrarModalAuth).toBe(false);
    expect(JSON.parse(localStorage.getItem('trender.auth') || '{}').metodo).toBe('password');
  });

  it('exige una contraseña de al menos 8 caracteres', () => {
    component.abrirAuthModal('registro');
    component.nombreIngresado = 'Usuario Demo';
    component.emailIngresado = 'clasica@trender.com';
    component.passwordIngresado = 'corta';

    component.registrarConPassword();

    expect(component.errorAuth).toBe('La contraseña debe tener al menos 8 caracteres.');
    expect(component.sesionIniciada).toBe(false);
  });

  it('exige un nombre para crear la cuenta', () => {
    component.abrirAuthModal('registro');
    component.emailIngresado = 'clasica@trender.com';
    component.passwordIngresado = 'secreto-seguro';

    component.registrarConPassword();

    expect(component.errorAuth).toBe('Ingresa tu nombre.');
    expect(component.sesionIniciada).toBe(false);
  });

  it('reinicia medidas al cerrar sesión', () => {
    persistirSesion(crearSesion('demo@trender.com', 'password'));

    component.estatura = 182;
    component.peso = 84;
    localStorage.setItem(
      'trender.measurements',
      JSON.stringify({ estatura: 182, peso: 84, complexion: 'Atlética', genero: 'Masculino' })
    );

    component.cerrarSesion();

    expect(component.estatura).toBeNull();
    expect(component.peso).toBeNull();
    expect(component.prendaActiva).toBeNull();
    expect(localStorage.getItem('trender.measurements')).toBeNull();
  });

  it('renderiza la sección Escáner Web de Prendas', () => {
    fixture.detectChanges();

    const escaner = fixture.nativeElement.querySelector('#escaner') as HTMLElement;
    expect(escaner).toBeTruthy();
    expect(escaner.textContent).toContain('Escáner Web de Prendas');
    expect(escaner.textContent).toContain('Importa cualquier prenda por URL');
    expect(escaner.querySelector('input[type="url"]')).toBeTruthy();
    expect(escaner.querySelector('button')).toBeTruthy();
  });

  it('muestra error si URL está vacía al escanear', () => {
    component.urlEscaneo = '';
    component.escanearProducto();

    expect(component.errorEscaneo).toBe(
      'No pudimos analizar este enlace. Intenta con una URL válida de una tienda.'
    );
    expect(component.escaneando).toBe(false);
  });

  it('llama al endpoint de escaneo con URL válida', () => {
    const spy = vi.spyOn(component['http'], 'post').mockReturnValue(
      of({
        success: true,
        prenda: {
          id: 'scanned_1',
          nombre: 'Blazer Estructurado',
          precio: '$2,590',
          categoria: 'Torso',
          imagenUrl: 'https://example.com/blazer.jpg'
        }
      })
    );

    component.urlEscaneo = 'https://www.zara.com/blazer';
    component.escanearProducto();

    expect(spy).toHaveBeenCalledTimes(1);
    const callArgs = spy.mock.calls[0];
    expect(callArgs[0]).toBe(`${environment.apiUrl}/api/ropa/escanear-link`);
    expect(callArgs[1]).toEqual({ url: 'https://www.zara.com/blazer' });
  });

  it('detiene el loader y muestra un error limpio si falla el endpoint', () => {
    vi.spyOn(component['http'], 'post').mockReturnValue(
      throwError(() => new Error('Request failed'))
    );

    component.urlEscaneo = 'https://tienda.example/producto';
    component.escanearProducto();

    expect(component.escaneando).toBe(false);
    expect(component.errorEscaneo).toBe(
      'No pudimos analizar este enlace. Intenta con una URL válida de una tienda.'
    );
  });

  it('asigna el calzado a ambos pies del maniquí', () => {
    const partes = component['partesParaPrenda']({
      id: 'shoe-1',
      nombre: 'Calzado Deportivo/Casual',
      precio: '$1,499',
      categoria: 'Calzado',
      imagenUrl: '/ropa/textura_calzado.png'
    });

    expect(partes).toEqual(['pie_izq', 'pie_der']);
  });

  it('restaura los materiales de porcelana y ropa interior', () => {
    component['mannequinMaterial'].color.setHex(0x3f4e3b);
    component['underwearMaterial'].color.setHex(0x1c1917);

    component.quitarRopa();

    expect(component['mannequinMaterial'].color.getHex()).toBe(0xe2e8f0);
    expect(component['underwearMaterial'].color.getHex()).toBe(0x2d3728);
  });

  it('muestra la prenda escaneada y permite probarla', () => {
    const prendaMock = {
      id: 'scanned_1',
      nombre: 'Blazer Estructurado',
      precio: '$2,590',
      categoria: 'Torso' as const,
      imagenUrl: 'https://example.com/blazer.jpg'
    };

    component.prendaEscaneada = prendaMock;
    fixture.detectChanges();

    const escaner = fixture.nativeElement.querySelector('#escaner') as HTMLElement;
    expect(escaner.textContent).toContain('Blazer Estructurado');
    expect(escaner.textContent).toContain('$2,590');
    expect(escaner.textContent).toContain('Probar en mi Avatar 3D');

    component.probarPrendaEscaneada();

    expect(component.prendaActiva?.id).toBe('scanned_1');
    expect(component.prendaActiva?.nombre).toBe('Blazer Estructurado');
  });

  it('limpia el escaneo y permite escanear otra prenda', () => {
    component.urlEscaneo = 'https://test.com';
    component.prendaEscaneada = { id: 's1', nombre: 'Test', precio: '$100', categoria: 'Torso', imagenUrl: 'img.jpg' };
    component.errorEscaneo = null;

    component.limpiarEscaneo();

    expect(component.urlEscaneo).toBe('');
    expect(component.prendaEscaneada).toBeNull();
    expect(component.errorEscaneo).toBeNull();
  });

  it('renderiza la sección Mi Espacio de Medición solo con sesión', () => {
    expect(fixture.nativeElement.querySelector('#mi-espacio')).toBeNull();

    persistirSesion(crearSesion('demo@trender.com', 'password'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#mi-espacio')).toBeTruthy();
  });

  it('muestra el nombre del usuario en el Navbar al iniciar sesión', () => {
    persistirSesion(crearSesion('demo@trender.com', 'password'));
    fixture.detectChanges();

    expect(component.nombreAutenticado).toBe('Usuario Demo');
    expect(fixture.nativeElement.textContent).toContain('Hola, Usuario Demo');
  });

  it('activa y desactiva el modo inmersivo del visor', () => {
    component.activarModoInmersivo();

    expect(component.modoInmersivo).toBe(true);
    expect(document.body.classList.contains('overflow-hidden')).toBe(true);

    component.salirModoInmersivo();

    expect(component.modoInmersivo).toBe(false);
    expect(document.body.classList.contains('overflow-hidden')).toBe(false);
  });

  it('renderiza métricas del hero y footer institucional', () => {
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('99.2%');
    expect(texto).toContain('Precisión Biométrica');
    expect(texto).toContain('Escáner Web');
    expect(texto).toContain('0.0s');
    expect(texto).toContain('© 2026 Trender');
  });

  it('no expone exportación GLB ni inputs OTP', () => {
    const texto = (fixture.nativeElement.textContent as string).toLowerCase();

    expect(texto).not.toContain('.glb');
    expect(texto).not.toContain('exportar avatar');
    expect(texto).not.toContain('escanear mi cuerpo');
    expect(fixture.nativeElement.querySelectorAll('input[autocomplete="one-time-code"]').length).toBe(0);
  });
});
