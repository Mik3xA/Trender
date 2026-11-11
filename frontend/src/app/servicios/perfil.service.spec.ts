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

  it('lee los perfiles de cada apartado y sanea los datos', () => {
    let resultado: any;
    servicio.obtener().subscribe((r) => (resultado = r));
    http.expectOne(url).flush({
      status: 'success',
      data: {
        altura: 181, pecho: null, cintura: null, cadera: null,
        avatar_config: {
          genero: 'Masculino',
          perfiles: {
            Masculino: { medidas: { altura: 181, peso: 80, tipoCuerpo: 'ovalo' }, conjunto: [MUESTRAS[0]], tono: 'medio' },
          },
        },
      },
    });
    expect(resultado.activo).toBe('Masculino');
    expect(resultado.perfiles.Masculino).toMatchObject({
      medidas: { genero: 'Masculino', altura: 181, peso: 80, tipoCuerpo: 'sobrepeso' },
      conjunto: [MUESTRAS[0]],
      tono: 'medio',
    });
    expect(resultado.perfiles.Femenino).toBeUndefined();
  });

  it('guarda ambos apartados y las medidas del activo en las columnas', () => {
    const perfiles = {
      Femenino: { medidas: { ...MEDIDAS_INICIALES.Femenino, cintura: 66 }, conjunto: [], tono: 'claro' },
      Masculino: { medidas: MEDIDAS_INICIALES.Masculino, conjunto: [MUESTRAS[1]], tono: 'maniqui' },
    };
    servicio.guardar('Femenino', perfiles).subscribe();
    const req = http.expectOne(url);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toMatchObject({
      altura: 163,
      cintura: 66,
      avatar_config: { genero: 'Femenino', perfiles: { Masculino: { conjunto: [MUESTRAS[1]] } } },
    });
    req.flush({ status: 'success' });
  });
});
