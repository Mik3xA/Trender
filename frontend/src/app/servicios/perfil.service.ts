import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { Medidas, TipoCuerpo, sanearMedidas } from '../probador/cuerpo';
import { PrendaVirtual } from '../probador/prendas';
import { AuthService } from './auth.service';

/** Forma de GET/PUT /api/profile en el backend. */
interface PerfilApi {
  altura: number | null;
  pecho: number | null;
  cintura: number | null;
  cadera: number | null;
  avatar_config: {
    peso?: number;
    genero?: string;
    tipoCuerpo?: string;
    /** Prototipo anterior: Delgada | Atlética | Media | Robusta. */
    complexion?: string;
    conjunto?: PrendaVirtual[];
  };
}

export interface PerfilProbador {
  medidas: Medidas;
  conjunto: PrendaVirtual[];
}

const COMPLEXION_A_TIPO: Record<string, TipoCuerpo> = {
  Atlética: 'triangulo-invertido',
  Robusta: 'ovalo',
  Delgada: 'rectangulo',
  Media: 'rectangulo',
};

const MAX_PRENDAS_GUARDADAS = 6;

/** Medidas y conjunto del usuario en su cuenta (estatura en `altura`, el resto en `avatar_config`). */
@Injectable({ providedIn: 'root' })
export class PerfilService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = `${environment.apiUrl}/api/profile`;

  /** null si el perfil todavía no tiene medidas guardadas. */
  obtener(): Observable<PerfilProbador | null> {
    return this.http.get<{ status: string; data: PerfilApi }>(this.url, { headers: this.auth.cabecerasAuth() }).pipe(
      map(({ data }) => {
        const config = data?.avatar_config ?? {};
        if (!data?.altura && !config.peso) return null;
        const medidas = sanearMedidas({
          genero: config.genero as Medidas['genero'],
          altura: data.altura ?? undefined,
          peso: config.peso,
          tipoCuerpo: (config.tipoCuerpo ?? COMPLEXION_A_TIPO[config.complexion ?? '']) as TipoCuerpo,
          pecho: data.pecho,
          cintura: data.cintura,
          cadera: data.cadera,
        });
        const conjunto = Array.isArray(config.conjunto) ? config.conjunto.slice(0, MAX_PRENDAS_GUARDADAS) : [];
        return { medidas, conjunto };
      })
    );
  }

  guardar({ medidas, conjunto }: PerfilProbador): Observable<unknown> {
    return this.http.put(
      this.url,
      {
        altura: Math.round(medidas.altura * 10) / 10,
        pecho: medidas.pecho ?? null,
        cintura: medidas.cintura ?? null,
        cadera: medidas.cadera ?? null,
        avatar_config: {
          peso: Math.round(medidas.peso * 10) / 10,
          genero: medidas.genero,
          tipoCuerpo: medidas.tipoCuerpo,
          conjunto: conjunto.slice(0, MAX_PRENDAS_GUARDADAS).map(({ imagen, ...resto }) => resto),
        },
      },
      { headers: this.auth.cabecerasAuth() }
    );
  }
}
