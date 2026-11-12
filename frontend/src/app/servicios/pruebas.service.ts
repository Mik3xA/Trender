import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap, take, takeWhile, timer } from 'rxjs';

import { environment } from '../../environments/environment';
import { CategoriaArmario, Parte } from '../probador/prendas';

export interface Prueba {
  id: string;
  persona_id: string | null;
  prendas: Array<{ id: string; nombre: string | null; categoria: CategoriaArmario; tipo: string | null; imagen_url: string; usar?: Parte[] }>;
  status: 'processing' | 'ready' | 'failed';
  proveedor: 'gemini' | 'fashn' | 'local';
  avisos: string[];
  error: string | null;
  imagen_url: string | null;
  created_at: string;
}

export interface EstadoIa {
  proveedor: 'gemini' | 'fashn' | 'local';
  ia: boolean;
  maxPrendas: number;
  maxFotos: number;
}

const INTERVALO_MS = 2000;
const ESPERA_MAXIMA = 120; // ≈ 4 min

/** Pruebas con IA: foto de la persona + prendas -> imagen generada. */
@Injectable({ providedIn: 'root' })
export class PruebasService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/api/pruebas`;

  estado(): Observable<EstadoIa> {
    return this.http.get<{ data: EstadoIa }>(`${this.url}/estado`).pipe(map((r) => r.data));
  }

  listar(): Observable<Prueba[]> {
    return this.http.get<{ data: { items: Prueba[] } }>(this.url).pipe(map((r) => r.data.items));
  }

  /** Crea la prueba y emite su estado hasta que deja de estar "processing". */
  crear(personaId: string, prendas: Array<{ id: string; usar?: Parte[] }>): Observable<Prueba> {
    return this.http.post<{ data: Prueba }>(this.url, { personaId, prendas }).pipe(switchMap(({ data }) => this.seguir(data.id)));
  }

  seguir(id: string): Observable<Prueba> {
    return timer(0, INTERVALO_MS).pipe(
      take(ESPERA_MAXIMA),
      switchMap(() => this.http.get<{ data: Prueba }>(`${this.url}/${id}`)),
      map((r) => r.data),
      takeWhile((p) => p.status === 'processing', true)
    );
  }

  eliminar(id: string): Observable<unknown> {
    return this.http.delete(`${this.url}/${id}`);
  }
}
