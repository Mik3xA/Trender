import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { environment } from '../../environments/environment';
import { MEDIDAS_INICIALES } from '../probador/cuerpo';
import { MUESTRAS } from '../probador/prendas';
import { PerfilService } from './perfil.service';

describe('PerfilService', () => {
  let servicio: PerfilService;
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/api/profile`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(PerfilService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lee medidas y conjunto del perfil', () => {
    let resultado: unknown;
    servicio.obtener().subscribe((r) => (resultado = r));
    http.expectOne(url).flush({
      status: 'success',
      data: {
        altura: 181, pecho: 100, cintura: null, cadera: null,
        avatar_config: { peso: 80, genero: 'Masculino', tipoCuerpo: 'ovalo', conjunto: [MUESTRAS[0]] },
      },
    });
    expect(resultado).toMatchObject({
      medidas: { genero: 'Masculino', altura: 181, peso: 80, tipoCuerpo: 'ovalo', pecho: 100, cintura: null },
      conjunto: [MUESTRAS[0]],
    });
  });

  it('convierte la complexión del prototipo anterior en tipo de cuerpo', () => {
    let resultado: { medidas: { tipoCuerpo: string } } | null = null;
    servicio.obtener().subscribe((r) => (resultado = r));
    http.expectOne(url).flush({
      status: 'success',
      data: { altura: 170, pecho: null, cintura: null, cadera: null, avatar_config: { peso: 70, complexion: 'Atlética', genero: 'Masculino' } },
    });
    expect(resultado!.medidas.tipoCuerpo).toBe('triangulo-invertido');
  });

  it('devuelve null si la cuenta aún no tiene medidas', () => {
    let resultado: unknown = 'sin respuesta';
    servicio.obtener().subscribe((r) => (resultado = r));
    http.expectOne(url).flush({ status: 'success', data: { altura: null, pecho: null, cintura: null, cadera: null, avatar_config: {} } });
    expect(resultado).toBeNull();
  });

  it('guarda altura y contornos en columnas y el resto en avatar_config (sin imágenes)', () => {
    servicio.guardar({ medidas: { ...MEDIDAS_INICIALES.Femenino, cintura: 66 }, conjunto: [{ ...MUESTRAS[1], imagen: 'https://x/y.jpg' }] }).subscribe();
    const req = http.expectOne(url);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toMatchObject({
      altura: 163, pecho: null, cintura: 66,
      avatar_config: { peso: 58, genero: 'Femenino', tipoCuerpo: 'reloj-de-arena' },
    });
    expect(req.request.body.avatar_config.conjunto[0].imagen).toBeUndefined();
    req.flush({ status: 'success' });
  });
});
