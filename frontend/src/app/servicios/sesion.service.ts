import { HttpClient, HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';

import { environment } from '../../environments/environment';

const CLAVE_SESION = 'trender.sesion';
const API = `${environment.apiUrl}/api/`;
const URL_INVITADO = `${environment.apiUrl}/api/auth/invitado`;

interface SesionGuardada {
  token: string;
  expiresAt: string;
}

/**
 * Sesión anónima (sin pantalla de login). Al primer uso pide al backend un
 * usuario invitado y guarda su token: así el armario y las medidas de cada
 * persona siguen siendo privados en el servidor sin que tenga que registrarse.
 */
@Injectable({ providedIn: 'root' })
export class SesionService {
  private readonly http = inject(HttpClient);
  private guardada: SesionGuardada | null = this.leer();
  private enCurso: Observable<string> | null = null;

  /** Token vigente; si no hay, crea un invitado (una sola petición aunque se pida a la vez). */
  token(): Observable<string> {
    if (this.guardada && new Date(this.guardada.expiresAt).getTime() > Date.now() + 60_000) {
      return of(this.guardada.token);
    }
    this.enCurso ??= this.http
      .post<{ data: { token: string; expires_at: string } }>(URL_INVITADO, {})
      .pipe(
        map(({ data }) => ({ token: data.token, expiresAt: data.expires_at })),
        tap((sesion) => this.guardar(sesion)),
        map((sesion) => sesion.token),
        finalize(() => (this.enCurso = null)),
        shareReplay(1)
      );
    return this.enCurso;
  }

  /** El servidor rechazó el token (expirado o revocado): se descarta. */
  invalidar(): void {
    this.guardada = null;
    try {
      localStorage.removeItem(CLAVE_SESION);
    } catch {
      /* sin almacenamiento */
    }
  }

  private guardar(sesion: SesionGuardada): void {
    this.guardada = sesion;
    try {
      localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
    } catch {
      /* la sesión vive en memoria */
    }
  }

  private leer(): SesionGuardada | null {
    try {
      const datos = JSON.parse(localStorage.getItem(CLAVE_SESION) ?? 'null');
      return typeof datos?.token === 'string' && typeof datos?.expiresAt === 'string' ? datos : null;
    } catch {
      return null;
    }
  }
}

/** ¿La petición necesita la sesión? (API propia, salvo crear invitado y el escáner público). */
function necesitaSesion(req: HttpRequest<unknown>): boolean {
  return req.url.startsWith(API) && req.url !== URL_INVITADO && !req.url.startsWith(`${API}ropa/`);
}

/**
 * Añade `Authorization: Bearer <token>` a la API. Si el servidor responde 401
 * (token caducado o de otra base de datos) crea una sesión nueva y reintenta una vez.
 */
export const sesionInterceptor: HttpInterceptorFn = (req, next) => {
  if (!necesitaSesion(req)) return next(req);
  const sesion = inject(SesionService);
  const conToken = (token: string) => req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  return sesion.token().pipe(
    switchMap((token) =>
      next(conToken(token)).pipe(
        catchError((error: HttpErrorResponse) => {
          if (error.status !== 401) return throwError(() => error);
          sesion.invalidar();
          return sesion.token().pipe(switchMap((nuevo) => next(conToken(nuevo))));
        })
      )
    )
  );
};
