import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from '../../environments/environment';
import { ArmarioService, PrendaArmario, tipoImagen, urlPrenda } from './armario.service';

const URL = `${environment.apiUrl}/api/closet`;
const prenda = (extra: Partial<PrendaArmario>): PrendaArmario =>
  ({ id: 'p1', genero: 'Femenino', imagen_url: null, category: null, tipo: null, nombre: null, color: null, status: 'processing', error: null, analisis: null, created_at: '', ...extra }) as PrendaArmario;

describe('ArmarioService', () => {
  let servicio: ArmarioService;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(ArmarioService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('sube la foto (202) y consulta cada segundo hasta que deja de estar "processing"', () => {
    const estados: string[] = [];
    let completo = false;
    const foto = new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' });
    servicio.subirFoto(foto, 'Masculino', { nombre: 'Jeans', tipo: 'outfit' }).subscribe({ next: (p) => estados.push(p.status), complete: () => (completo = true) });

    const post = http.expectOne((r) => r.url === `${URL}/subir`);
    expect(post.request.body).toBe(foto);
    expect(post.request.headers.get('Content-Type')).toBe('image/jpeg');
    expect(post.request.params.get('genero')).toBe('Masculino');
    expect(post.request.params.get('tipo')).toBe('outfit');
    post.flush({ data: prenda({}) });

    vi.advanceTimersByTime(0);
    http.expectOne(`${URL}/p1`).flush({ data: prenda({}) });
    vi.advanceTimersByTime(1000);
    http.expectOne(`${URL}/p1`).flush({ data: prenda({ status: 'ready', category: 'bottom', tipo: 'jeans' }) });
    vi.advanceTimersByTime(3000);
    expect(estados).toEqual(['processing', 'ready']);
    expect(completo).toBe(true);
  });

  it('envía las respuestas del cuestionario (incluidas las partes de un outfit)', () => {
    servicio.clasificar('p1', 'outfit', 'outfit', { usar: ['top', 'shoes'] }).subscribe();
    const req = http.expectOne(`${URL}/p1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ category: 'outfit', tipo: 'outfit', ajustes: { usar: ['top', 'shoes'] } });
    req.flush({ data: prenda({}) });
  });

  it('borra prendas y lista por género', () => {
    servicio.eliminar('p1').subscribe();
    expect(http.expectOne(`${URL}/p1`).request.method).toBe('DELETE');
    servicio.listar('Femenino').subscribe();
    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get('genero')).toBe('Femenino');
    req.flush({ data: { items: [] } });
  });

  it('tipo MIME y URL del recorte', () => {
    expect(tipoImagen(new File(['x'], 'IMG_1.HEIC'))).toBe('image/heic');
    expect(tipoImagen(new Blob(['x'], { type: 'image/png' }))).toBe('image/png');
    expect(urlPrenda({ imagen_url: '/media/a.png' })).toBe(`${environment.apiUrl}/media/a.png`);
    expect(urlPrenda({ imagen_url: null })).toBeNull();
  });
});
