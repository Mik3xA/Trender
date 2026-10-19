import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('solicita el código al endpoint correcto', () => {
    service.solicitarCodigo('demo@trender.com').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/api/auth/solicitar-codigo`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'demo@trender.com' });
    req.flush({ status: 'success', message: 'Código enviado' });
  });

  it('persiste la sesión al verificar el código', () => {
    const respuesta = {
      status: 'success',
      token: 'token-123',
      user: { id: 'u1', nombre: 'Demo', email: 'demo@trender.com' }
    };

    service.verificarCodigo('demo@trender.com', '123456').subscribe((sesion) => {
      expect(sesion.token).toBe('token-123');
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/api/auth/verificar-codigo`);
    req.flush(respuesta);

    expect(service.sesionActual?.token).toBe('token-123');
    expect(JSON.parse(localStorage.getItem('trender.auth') || '{}').metodo).toBe('otp');
  });

  it('registra una cuenta clásica y persiste el método password', () => {
    service
      .registrar({ nombre: 'Demo', email: 'demo@trender.com', password: 'secreto-seguro' })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/api/auth/registro`);
    expect(req.request.method).toBe('POST');
    req.flush({
      status: 'success',
      token: 'token-password',
      user: { id: 'u1', nombre: 'Demo', email: 'demo@trender.com' }
    });

    expect(service.sesionActual?.metodo).toBe('password');
  });

  it('inicia sesión con contraseña', () => {
    service.iniciarSesion({ email: 'demo@trender.com', password: 'secreto-seguro' }).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/api/auth/login`);
    expect(req.request.method).toBe('POST');
    req.flush({
      status: 'success',
      token: 'token-password',
      user: { id: 'u1', nombre: 'Demo', email: 'demo@trender.com' }
    });

    expect(service.sesionActual?.email).toBe('demo@trender.com');
  });

  it('refresca el perfil con el token almacenado', () => {
    service.verificarCodigo('demo@trender.com', '123456').subscribe();
    httpMock
      .expectOne(`${environment.apiUrl}/api/auth/verificar-codigo`)
      .flush({
        status: 'success',
        token: 'token-123',
        user: { id: 'u1', nombre: 'Demo', email: 'demo@trender.com' }
      });

    service.refrescarSesion();

    const req = httpMock.expectOne(`${environment.apiUrl}/api/auth/me`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');
    req.flush({
      status: 'success',
      user: { id: 'u1', nombre: 'Demo Actualizado', email: 'demo@trender.com' }
    });

    expect(service.sesionActual?.user?.nombre).toBe('Demo Actualizado');
  });

  it('mantiene la sesión si la red falla al refrescar', () => {
    service.verificarCodigo('demo@trender.com', '123456').subscribe();
    httpMock
      .expectOne(`${environment.apiUrl}/api/auth/verificar-codigo`)
      .flush({
        status: 'success',
        token: 'token-123',
        user: { id: 'u1', nombre: 'Demo', email: 'demo@trender.com' }
      });

    service.refrescarSesion();
    httpMock
      .expectOne(`${environment.apiUrl}/api/auth/me`)
      .error(new ProgressEvent('error'), { status: 0 });

    expect(service.sesionActual?.email).toBe('demo@trender.com');
  });

  it('cierra la sesión y limpia localStorage', () => {
    service.verificarCodigo('demo@trender.com', '123456').subscribe();
    httpMock
      .expectOne(`${environment.apiUrl}/api/auth/verificar-codigo`)
      .flush({
        status: 'success',
        token: 'token-123',
        user: { id: 'u1', nombre: 'Demo', email: 'demo@trender.com' }
      });

    service.cerrarSesion();

    expect(service.sesionActual).toBeNull();
    expect(localStorage.getItem('trender.auth')).toBeNull();
  });
});
