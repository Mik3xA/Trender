import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { Genero, Medidas, sanearMedidas } from '../probador/cuerpo';
import { PrendaVirtual } from '../probador/prendas';

/** Lo que guarda cada apartado (Mujer / Hombre). */
export interface PerfilGenero {
  medidas: Medidas;
  conjunto: PrendaVirtual[];
  tono: string;
}

export type Perfiles = Record<Genero, PerfilGenero>;

interface PerfilApi {
  altura: number | null;
  pecho: number | null;
  cintura: number | null;
  cadera: number | null;
  avatar_config: { genero?: Genero; perfiles?: Partial<Record<Genero, Partial<PerfilGenero>>> };
}

const MAX_PRENDAS = 6;

/**
 * Medidas, conjunto y tono de cada apartado en /api/profile. Las columnas
 * altura/pecho/cintura/cadera guardan las del último apartado usado (para
 * otros clientes, p. ej. la app Flutter) y avatar_config.perfiles guarda ambos.
 */
@Injectable({ providedIn: 'root' })
export class PerfilService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/api/profile`;

  obtener(): Observable<{ activo: Genero | null; perfiles: Partial<Perfiles> }> {
    return this.http.get<{ data: PerfilApi }>(this.url).pipe(
      map(({ data }) => {
        const guardados = data?.avatar_config?.perfiles ?? {};
        const perfiles: Partial<Perfiles> = {};
        for (const genero of ['Femenino', 'Masculino'] as const) {
          const p = guardados[genero];
          if (!p?.medidas) continue;
          perfiles[genero] = {
            medidas: sanearMedidas({ ...p.medidas, genero }),
            conjunto: Array.isArray(p.conjunto) ? p.conjunto.slice(0, MAX_PRENDAS) : [],
            tono: typeof p.tono === 'string' ? p.tono : 'maniqui',
          };
        }
        return { activo: data?.avatar_config?.genero ?? null, perfiles };
      })
    );
  }

  guardar(activo: Genero, perfiles: Perfiles): Observable<unknown> {
    const m = perfiles[activo].medidas;
    return this.http.put(this.url, {
      altura: Math.round(m.altura * 10) / 10,
      pecho: m.pecho ?? null,
      cintura: m.cintura ?? null,
      cadera: m.cadera ?? null,
      avatar_config: {
        genero: activo,
        perfiles: Object.fromEntries(
          Object.entries(perfiles).map(([g, p]) => [g, { ...p, conjunto: p.conjunto.slice(0, MAX_PRENDAS) }])
        ),
      },
    });
  }
}
