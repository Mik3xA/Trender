import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { AvatarSetupComponent } from './avatar-setup';
import { AuthResponse, AuthService, StoredSession } from '../servicios/auth.service';

describe('AvatarSetupComponent', () => {
  let fixture: ComponentFixture<AvatarSetupComponent>;
  let component: AvatarSetupComponent;
  let sesionSubject: BehaviorSubject<StoredSession | null>;
  let authMock: {
    sesion$: Observable<StoredSession | null>;
    sesionActual: StoredSession | null;
    refrescarSesion: () => void;
    solicitarCodigo: (email: string) => Observable<{ status: string; message: string }>;
    verificarCodigo: (email: string, codigo: string) => Observable<AuthResponse>;
    registrar: (payload: { nombre?: string; email: string; password: string }) => Observable<AuthResponse>;
    iniciarSesion: (payload: { email: string; password: string }) => Observable<AuthResponse>;
    obtenerPerfil: () => Observable<{ status: string; user: { id: string; nombre: string; email: string } }>;
    cerrarSesion: () => void;
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
      solicitarCodigo: () => of({ status: 'success', message: 'Código enviado' }),
      verificarCodigo: (email, codigo) => {
        if (codigo !== '123456') {
          return throwError(() => ({ status: 401, error: { message: 'Código inválido' } }));
        }
        const sesion = crearSesion(email, 'otp');
        persistirSesion(sesion);
        return of({ status: 'success', token: sesion.token, user: sesion.user! });
      },
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
          user: { id: 'user-otp', nombre: 'Usuario Demo', email: 'demo@trender.com' }
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
    component.irAPasswordRegistro();
    component.nombreIngresado = 'Michael';
    component.emailIngresado = 'michael@trender.com';
    component.passwordIngresado = 'secreto-seguro';
    component.passwordConfirmacion = 'secreto-seguro';

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

  it('solicita el OTP y solo acepta el código 123456', () => {
    component.abrirAuthModal('login');
    component.emailIngresado = 'otp@trender.com';

    component.enviarCodigo();

    expect(component.modoAuth).toBe('codigo');
    expect(component.codigoEnviado).toBe(true);
    expect(component.reenvioSegundos).toBe(30);

    component.codigoVerificacion = '000000';
    component.verificarCodigo();
    expect(component.errorCodigo).toContain('Código inválido');
    expect(component.sesionIniciada).toBe(false);

    component.codigoVerificacion = '123456';
    component.verificarCodigo();

    expect(component.sesionIniciada).toBe(true);
    expect(component.mostrarModalAuth).toBe(false);
    expect(component.emailAutenticado).toBe('otp@trender.com');
  });

  it('crea una cuenta clásica con contraseña', () => {
    component.abrirAuthModal('registro');
    component.irAPasswordRegistro();
    component.nombreIngresado = 'Estudio Trender';
    component.emailIngresado = 'clasica@trender.com';
    component.passwordIngresado = 'secreto-seguro';
    component.passwordConfirmacion = 'secreto-seguro';

    component.registrarConPassword();
    vi.advanceTimersByTime(2000);

    expect(component.sesionIniciada).toBe(true);
    expect(component.mostrarModalAuth).toBe(false);
    expect(JSON.parse(localStorage.getItem('trender.auth') || '{}').metodo).toBe('password');
  });

  it('valida que las contraseñas coincidan', () => {
    component.abrirAuthModal('registro');
    component.irAPasswordRegistro();
    component.nombreIngresado = 'Usuario Demo';
    component.emailIngresado = 'clasica@trender.com';
    component.passwordIngresado = 'secreto-seguro';
    component.passwordConfirmacion = 'otra-clave';

    component.registrarConPassword();

    expect(component.errorAuth).toBe('Las contraseñas no coinciden.');
    expect(component.sesionIniciada).toBe(false);
  });

  it('exige un nombre para crear la cuenta', () => {
    component.abrirAuthModal('registro');
    component.irAPasswordRegistro();
    component.emailIngresado = 'clasica@trender.com';
    component.passwordIngresado = 'secreto-seguro';
    component.passwordConfirmacion = 'secreto-seguro';

    component.registrarConPassword();

    expect(component.errorAuth).toBe('Ingresa tu nombre.');
    expect(component.sesionIniciada).toBe(false);
  });

  it('conecta una tienda sin sesión tras la redirección simulada', () => {
    const tienda = component.tiendas.find((item) => item.nombre === 'Zara')!;

    component.vincularTienda(tienda);

    expect(component.redirigiendoTienda).toBe('Zara');
    expect(component.mostrarModalAuth).toBe(false);
    expect(tienda.vinculada).toBe(false);

    vi.advanceTimersByTime(1500);

    expect(component.redirigiendoTienda).toBeNull();
    expect(component.tiendas.find((item) => item.nombre === 'Zara')?.vinculada).toBe(true);
    expect(JSON.parse(localStorage.getItem('trender.stores') || '[]')).toContain('Zara');
  });

  it('ignora una nueva conexión mientras hay una redirección en curso', () => {
    component.vincularTienda(component.tiendas[0]);
    component.vincularTienda(component.tiendas[1]);

    expect(component.redirigiendoTienda).toBe(component.tiendas[0].nombre);

    vi.advanceTimersByTime(1500);

    expect(component.tiendas[0].vinculada).toBe(true);
    expect(component.tiendas[1].vinculada).toBe(false);
  });

  it('muestra el panel Mi Espacio de Medición solo con sesión', () => {
    expect(fixture.nativeElement.querySelector('#mi-espacio')).toBeNull();

    persistirSesion(crearSesion('demo@trender.com', 'otp'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#mi-espacio')).toBeTruthy();
  });

  it('muestra el nombre del usuario en el Navbar al iniciar sesión', () => {
    persistirSesion(crearSesion('demo@trender.com', 'otp'));
    fixture.detectChanges();

    expect(component.nombreAutenticado).toBe('Usuario Demo');
    expect(fixture.nativeElement.textContent).toContain('Hola, Usuario Demo');
  });

  it('explora 11 catálogos y permite seleccionar una prenda con sesión', () => {
    expect(component.catalogos.length).toBe(11);

    const prenda = component.catalogos[0].prendas[0];
    component.probarPrenda(prenda);

    expect(component.mostrarModalAuth).toBe(true);
    expect(component.prendaPendiente?.id).toBe(prenda.id);

    persistirSesion(crearSesion('demo@trender.com', 'otp'));
    component.probarPrenda(prenda);

    expect(component.prendaSeleccionada?.id).toBe(prenda.id);
  });

  it('abre y cierra el acordeón de preguntas frecuentes', () => {
    component.toggleFaq(0);
    expect(component.faqAbierto).toBe(0);

    component.toggleFaq(0);
    expect(component.faqAbierto).toBeNull();
  });
});
