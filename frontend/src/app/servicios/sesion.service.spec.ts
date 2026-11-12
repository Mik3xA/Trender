import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from '../../environments/environment';
import { SesionService, sesionInterceptor } from './sesion.service';

const API = environment.apiUrl;
const invitado = (token: string) => ({ status: 'success', data: { token, expires_at: '2999-01-01T00:00:00Z', user: {} } });

describe('SesionService + sesionInterceptor', () => {
  let http: HttpClient;
  let mock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([sesionInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    mock.verify();
    localStorage.clear();
  });

  it('crea una sesión de invitado una sola vez y la reutiliza', () => {
    http.get(`${API}/api/closet`).subscribe();
    http.get(`${API}/api/profile`).subscribe();
    mock.expectOne(`${API}/api/auth/invitado`).flush(invitado('t1'));
    for (const r of [mock.expectOne(`${API}/api/closet`), mock.expectOne(`${API}/api/profile`)]) {
      expect(r.request.headers.get('Authorization')).toBe('Bearer t1');
      r.flush({});
    }
    expect(JSON.parse(localStorage.getItem('trender.sesion')!).token).toBe('t1');

    http.get(`${API}/api/closet`).subscribe();
    mock.expectOne(`${API}/api/closet`).flush({}); // sin pedir otro invitado
  });

  it('si el token caduca (401) crea otra sesión y reintenta', () => {
    localStorage.setItem('trender.sesion', JSON.stringify({ token: 'viejo', expiresAt: '2999-01-01T00:00:00Z' }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([sesionInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    mock = TestBed.inject(HttpTestingController);

    let respuesta: unknown;
    http.get(`${API}/api/closet`).subscribe((r) => (respuesta = r));
    mock.expectOne(`${API}/api/closet`).flush({}, { status: 401, statusText: 'Unauthorized' });
    mock.expectOne(`${API}/api/auth/invitado`).flush(invitado('nuevo'));
    const reintento = mock.expectOne(`${API}/api/closet`);
    expect(reintento.request.headers.get('Authorization')).toBe('Bearer nuevo');
    reintento.flush({ ok: true });
    expect(respuesta).toEqual({ ok: true });
  });

  it('no añade sesión al escáner público ni a otros dominios', () => {
    http.post(`${API}/api/ropa/escanear-link`, {}).subscribe();
    http.get('https://cdn.example/imagen.png').subscribe();
    expect(mock.expectOne(`${API}/api/ropa/escanear-link`).request.headers.has('Authorization')).toBe(false);
    expect(mock.expectOne('https://cdn.example/imagen.png').request.headers.has('Authorization')).toBe(false);
  });

  it('descarta el token al invalidar', () => {
    const sesion = TestBed.inject(SesionService);
    localStorage.setItem('trender.sesion', '{}');
    sesion.invalidar();
    expect(localStorage.getItem('trender.sesion')).toBeNull();
  });
});
