import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from '../../environments/environment';
import { ImagenesService } from './imagenes.service';
import { PersonaService } from './persona.service';
import { Prueba, PruebasService } from './pruebas.service';

const API = `${environment.apiUrl}/api`;

describe('PruebasService, PersonaService e ImagenesService', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('crea la prueba y la sigue hasta que la imagen está lista', () => {
    const estados: string[] = [];
    TestBed.inject(PruebasService)
      .crear('f1', [{ id: 'p1' }, { id: 'o1', usar: ['top'] }])
      .subscribe((p) => estados.push(p.status));
    const post = http.expectOne(`${API}/pruebas`);
    expect(post.request.body).toEqual({ personaId: 'f1', prendas: [{ id: 'p1' }, { id: 'o1', usar: ['top'] }] });
    post.flush({ data: { id: 'x1', status: 'processing' } as Prueba });
    vi.advanceTimersByTime(0);
    http.expectOne(`${API}/pruebas/x1`).flush({ data: { id: 'x1', status: 'processing' } });
    vi.advanceTimersByTime(2000);
    http.expectOne(`${API}/pruebas/x1`).flush({ data: { id: 'x1', status: 'ready', imagen_url: '/api/pruebas/x1/imagen' } });
    vi.advanceTimersByTime(6000);
    expect(estados).toEqual(['processing', 'ready']);
  });

  it('sube y borra fotos de la persona', () => {
    const servicio = TestBed.inject(PersonaService);
    const foto = new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
    servicio.subir(foto).subscribe();
    const req = http.expectOne(`${API}/persona`);
    expect(req.request.body).toBe(foto);
    req.flush({ data: { id: 'f1' } });
    servicio.eliminar('f1').subscribe();
    expect(http.expectOne(`${API}/persona/f1`).request.method).toBe('DELETE');
  });

  it('las imágenes privadas se piden una vez con la sesión y se cachean', async () => {
    const servicio = TestBed.inject(ImagenesService);
    URL.createObjectURL ??= () => '';
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-1');
    expect(servicio.url('/api/persona/f1/imagen')).toBeNull();
    expect(servicio.url('/api/persona/f1/imagen')).toBeNull(); // no repite la petición
    await Promise.resolve(); // la descarga sale fuera del render
    const req = http.expectOne(`${API}/persona/f1/imagen`);
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['x']));
    expect(servicio.url('/api/persona/f1/imagen')).toBe('blob:local-1');
    expect(servicio.url(null)).toBeNull();
  });
});
