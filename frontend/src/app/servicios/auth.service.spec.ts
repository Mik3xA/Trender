import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

const API = `${environment.apiUrl}/api/auth`;
const usuario = { id: 'u1', nombre: 'Demo', email: 'demo@trender.com' };
const respuestaSesion = (token = 'token-123') => ({
  status: 'success',
  data: { user: usuario, token, expires_at: '2999-01-01T00:00:00.000Z', session_id: 's1' }
});

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

  function iniciarSesion(token = 'token-123'): void {
    service.iniciarSesion({ email: 'demo@trender.com', password: 'secreto-seguro' }).subscribe();
    httpMock.expectOne(`${API}/login`).flush(respuestaSesion(token));
  }

  it('registra una cuenta con nombre y persiste la sesión', () => {
    service
      .registrar({ nombre: 'Demo', email: 'demo@trender.com', password: 'secreto-seguro' })
      .subscribe();

    const req = httpMock.expectOne(`${API}/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ nombre: 'Demo', email: 'demo@trender.com', password: 'secreto-seguro' });
    req.flush(respuestaSesion('token-registro'));

    expect(service.sesionActual?.token).toBe('token-registro');
    expect(service.sesionActual?.user?.nombre).toBe('Demo');
    expect(JSON.parse(localStorage.getItem('trender.auth') || '{}').token).toBe('token-registro');
  });

  it('inicia sesión con contraseña', () => {
    service.iniciarSesion({ email: 'demo@trender.com', password: 'secreto-seguro' }).subscribe();

    const req = httpMock.expectOne(`${API}/login`);
    expect(req.request.method).toBe('POST');
    req.flush(respuestaSesion());

    expect(service.sesionActual?.email).toBe('demo@trender.com');
    expect(service.obtenerToken()).toBe('token-123');
  });

  it('refresca el perfil con el token almacenado', () => {
    iniciarSesion();
    service.refrescarSesion();

    const req = httpMock.expectOne(`${API}/me`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');
    req.flush({ status: 'success', data: { user: { ...usuario, nombre: 'Demo Actualizado' }, profile: {} } });

    expect(service.sesionActual?.user?.nombre).toBe('Demo Actualizado');
  });

  it('mantiene la sesión si la red falla al refrescar', () => {
    iniciarSesion();
    service.refrescarSesion();
    httpMock.expectOne(`${API}/me`).error(new ProgressEvent('error'), { status: 0 });

    expect(service.sesionActual?.email).toBe('demo@trender.com');
  });

  it('descarta la sesión si el servidor la rechaza (401)', () => {
    iniciarSesion();
    service.refrescarSesion();
    httpMock.expectOne(`${API}/me`).flush({ status: 'error' }, { status: 401, statusText: 'Unauthorized' });

    expect(service.sesionActual).toBeNull();
    expect(localStorage.getItem('trender.auth')).toBeNull();
  });

  it('cierra la sesión en el servidor y limpia todo el estado local de Trender', () => {
    iniciarSesion();
    localStorage.setItem('trender.measurements', '{"estatura":170}');
    localStorage.setItem('otra-app', 'se conserva');

    service.cerrarSesion();

    const req = httpMock.expectOne(`${API}/logout`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');
    req.flush({ status: 'success' });

    expect(service.sesionActual).toBeNull();
    expect(localStorage.getItem('trender.auth')).toBeNull();
    expect(localStorage.getItem('trender.measurements')).toBeNull();
    expect(localStorage.getItem('otra-app')).toBe('se conserva');
  });

  it('ignora sesiones guardadas ya expiradas', () => {
    localStorage.setItem(
      'trender.auth',
      JSON.stringify({ sesionIniciada: true, email: 'a@b.co', token: 't', expiresAt: '2000-01-01T00:00:00Z' })
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);

    expect(TestBed.inject(AuthService).sesionActual).toBeNull();
  });
});
