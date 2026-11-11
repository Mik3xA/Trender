import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from '../../environments/environment';
import { ArmarioService, PrendaArmario, aPrendaVirtual } from './armario.service';

const URL = `${environment.apiUrl}/api/closet`;
const prenda = (extra: Partial<PrendaArmario>): PrendaArmario => ({
  id: 'p1', genero: 'Masculino', source_url: 'https://x.example/jeans', imagen_url: null, category: null, tipo: null,
  nombre: null, color: null, tienda: null, precio: null, status: 'processing', error: null, analisis: null,
  created_at: '2026-01-01', ...extra,
});

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

  it('importa (202) y consulta cada segundo hasta que la prenda deja de estar "processing"', () => {
    const estados: string[] = [];
    let completo = false;
    servicio.importar('https://x.example/jeans', 'Masculino').subscribe({ next: (p) => estados.push(p.status), complete: () => (completo = true) });

    const post = http.expectOne(`${URL}/importar`);
    expect(post.request.body).toEqual({ url: 'https://x.example/jeans', genero: 'Masculino' });
    post.flush({ data: prenda({}) });

    vi.advanceTimersByTime(0);
    http.expectOne(`${URL}/p1`).flush({ data: prenda({}) });
    vi.advanceTimersByTime(1000);
    http.expectOne(`${URL}/p1`).flush({ data: prenda({ status: 'ready', category: 'bottom', tipo: 'jeans' }) });
    vi.advanceTimersByTime(3000);

    expect(estados).toEqual(['processing', 'ready']);
    expect(completo).toBe(true);
  });

  it('lista el armario de un género', () => {
    servicio.listar('Femenino').subscribe();
    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get('genero')).toBe('Femenino');
    req.flush({ data: { items: [] } });
  });

  it('solo convierte en prenda vestible lo que está listo y con categoría', () => {
    expect(aPrendaVirtual(prenda({ status: 'review' }))).toBeNull();
    const lista = aPrendaVirtual(prenda({ status: 'ready', category: 'shoes', tipo: 'zapatos', imagen_url: '/media/x.png', color: '#222222' }));
    expect(lista).toMatchObject({ categoria: 'Calzado', tipo: 'zapatos', color: '#222222', imagen: `${environment.apiUrl}/media/x.png` });
    // Un tipo desconocido cae al tipo por defecto de la categoría.
    expect(aPrendaVirtual(prenda({ status: 'ready', category: 'top', tipo: 'poncho' }))!.tipo).toBe('camiseta');
  });
});
