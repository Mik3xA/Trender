import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { tipoImagen } from './armario.service';

/** Foto de la persona (privada: la imagen se pide con la sesión). */
export interface FotoPersona {
  id: string;
  ancho: number;
  alto: number;
  imagen_url: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class PersonaService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/api/persona`;

  listar(): Observable<FotoPersona[]> {
    return this.http.get<{ data: { items: FotoPersona[] } }>(this.url).pipe(map((r) => r.data.items));
  }

  subir(archivo: Blob): Observable<FotoPersona> {
    return this.http.post<{ data: FotoPersona }>(this.url, archivo, { headers: { 'Content-Type': tipoImagen(archivo) } }).pipe(map((r) => r.data));
  }

  eliminar(id: string): Observable<unknown> {
    return this.http.delete(`${this.url}/${id}`);
  }
}
