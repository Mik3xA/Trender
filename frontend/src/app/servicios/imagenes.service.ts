import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

import { environment } from '../../environments/environment';

/**
 * Imágenes privadas (tus fotos y las pruebas generadas): el servidor solo las
 * entrega con la sesión, así que se descargan con HttpClient (el interceptor
 * añade el token) y se muestran como URL local (blob:). Se cachean por ruta.
 */
@Injectable({ providedIn: 'root' })
export class ImagenesService {
  private readonly http = inject(HttpClient);
  private readonly urls = signal<Record<string, string>>({});
  private readonly pedidas = new Set<string>();

  constructor() {
    inject(DestroyRef).onDestroy(() => Object.values(this.urls()).forEach((u) => URL.revokeObjectURL?.(u)));
  }

  /** URL local de una ruta privada (/api/...); null mientras se descarga. */
  url(ruta: string | null | undefined): string | null {
    if (!ruta) return null;
    const lista = this.urls()[ruta];
    if (lista) return lista;
    if (!this.pedidas.has(ruta)) {
      this.pedidas.add(ruta);
      // Fuera del render: url() se llama desde la plantilla y ahí no se pueden escribir señales.
      queueMicrotask(() => this.descargar(ruta));
    }
    return null;
  }

  private descargar(ruta: string): void {
    this.http.get(`${environment.apiUrl}${ruta}`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const local = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '';
        this.urls.update((m) => ({ ...m, [ruta]: local }));
      },
      error: () => this.pedidas.delete(ruta),
    });
  }

  olvidar(ruta: string): void {
    const local = this.urls()[ruta];
    if (local) URL.revokeObjectURL?.(local);
    this.pedidas.delete(ruta);
    this.urls.update(({ [ruta]: _, ...resto }) => resto);
  }
}
