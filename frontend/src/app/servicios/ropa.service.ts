import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { PrendaEscaneada } from '../probador/prendas';

/** Escáner de prendas: POST /api/ropa/escanear-link (no requiere sesión). */
@Injectable({ providedIn: 'root' })
export class RopaService {
  private readonly http = inject(HttpClient);

  escanear(url: string): Observable<PrendaEscaneada> {
    return this.http
      .post<{ status: string; data: { prenda: PrendaEscaneada } }>(`${environment.apiUrl}/api/ropa/escanear-link`, { url })
      .pipe(map((respuesta) => respuesta.data.prenda));
  }
}
