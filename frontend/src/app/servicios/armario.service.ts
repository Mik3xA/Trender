import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap, take, takeWhile, timer } from 'rxjs';

import { environment } from '../../environments/environment';
import { Genero } from '../probador/cuerpo';
import { CategoriaPrenda, COLOR_POR_DEFECTO, ESTILOS, PrendaVirtual, TIPO_POR_CATEGORIA } from '../probador/prendas';

export type CategoriaArmario = 'top' | 'bottom' | 'dress' | 'shoes';

/** Prenda del armario tal como la devuelve /api/closet. */
export interface PrendaArmario {
  id: string;
  genero: Genero;
  source_url: string;
  imagen_url: string | null;
  category: CategoriaArmario | null;
  tipo: string | null;
  nombre: string | null;
  color: string | null;
  tienda: string | null;
  precio: string | null;
  status: 'pending' | 'processing' | 'ready' | 'review' | 'failed';
  error: string | null;
  analisis: {
    confianza: 'alta' | 'media' | 'baja' | 'ninguna';
    evidencias: string[];
    avisos: string[];
    metodoRecorte: string | null;
  } | null;
  created_at: string;
}

export const CATEGORIA_PROBADOR: Record<CategoriaArmario, CategoriaPrenda> = {
  top: 'Torso',
  bottom: 'Piernas',
  dress: 'Vestido',
  shoes: 'Calzado',
};

const INTERVALO_MS = 1000;
const ESPERA_MAXIMA = 90; // consultas (≈ 90 s)

/**
 * Armario en el servidor. La importación es asíncrona: POST devuelve 202 con la
 * prenda en "processing" y aquí se consulta cada segundo hasta que termina.
 */
@Injectable({ providedIn: 'root' })
export class ArmarioService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/api/closet`;

  listar(genero: Genero): Observable<PrendaArmario[]> {
    return this.http
      .get<{ data: { items: PrendaArmario[] } }>(this.url, { params: { genero } })
      .pipe(map((r) => r.data.items));
  }

  /** Emite la prenda en cada consulta y completa cuando deja de estar "processing". */
  importar(url: string, genero: Genero): Observable<PrendaArmario> {
    return this.http
      .post<{ data: PrendaArmario }>(`${this.url}/importar`, { url, genero })
      .pipe(switchMap(({ data }) => this.seguir(data.id)));
  }

  seguir(id: string): Observable<PrendaArmario> {
    return timer(0, INTERVALO_MS).pipe(
      take(ESPERA_MAXIMA),
      switchMap(() => this.http.get<{ data: PrendaArmario }>(`${this.url}/${id}`)),
      map((r) => r.data),
      takeWhile((p) => p.status === 'processing', true)
    );
  }

  clasificar(id: string, category: CategoriaArmario, tipo?: string): Observable<PrendaArmario> {
    return this.http
      .patch<{ data: PrendaArmario }>(`${this.url}/${id}`, tipo ? { category, tipo } : { category })
      .pipe(map((r) => r.data));
  }

  eliminar(id: string): Observable<unknown> {
    return this.http.delete(`${this.url}/${id}`);
  }
}

/** Prenda del armario lista para vestir en el avatar (null si aún no se puede). */
export function aPrendaVirtual(p: PrendaArmario): PrendaVirtual | null {
  if (p.status !== 'ready' || !p.category) return null;
  const categoria = CATEGORIA_PROBADOR[p.category];
  return {
    id: p.id,
    nombre: p.nombre ?? 'Prenda',
    categoria,
    tipo: p.tipo && ESTILOS[p.tipo] ? p.tipo : TIPO_POR_CATEGORIA[categoria],
    color: p.color ?? COLOR_POR_DEFECTO[categoria],
    tienda: p.tienda,
    precio: p.precio,
    imagen: p.imagen_url ? `${environment.apiUrl}${p.imagen_url}` : null,
  };
}
