import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AuthUser {
  id: string;
  nombre: string;
  email: string;
  created_at?: string;
}

/** Respuesta de /api/auth/register y /api/auth/login: `{ status, data }`. */
export interface AuthResponse {
  status: string;
  data: {
    user: AuthUser;
    token: string;
    expires_at: string;
    session_id: string;
  };
}

export interface StoredSession {
  sesionIniciada: boolean;
  email: string;
  token: string;
  expiresAt?: string;
  user?: AuthUser;
}

export interface RegistroPayload {
  nombre: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

const AUTH_STORAGE_KEY = 'trender.auth';
/** Todo el estado local de la app usa este prefijo y se borra al cerrar sesión. */
const STORAGE_PREFIX = 'trender.';
const AUTH_URL = `${environment.apiUrl}/api/auth`;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sesionSubject = new BehaviorSubject<StoredSession | null>(this.leerSesion());

  readonly sesion$ = this.sesionSubject.asObservable();

  constructor(private http: HttpClient) {}

  get sesionActual(): StoredSession | null {
    return this.sesionSubject.value;
  }

  registrar(payload: RegistroPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${AUTH_URL}/register`, payload)
      .pipe(tap((respuesta) => this.guardarSesion(respuesta)));
  }

  iniciarSesion(payload: LoginPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${AUTH_URL}/login`, payload)
      .pipe(tap((respuesta) => this.guardarSesion(respuesta)));
  }

  obtenerPerfil(): Observable<AuthUser> {
    return this.http
      .get<{ status: string; data: { user: AuthUser } }>(`${AUTH_URL}/me`, {
        headers: this.cabecerasAuth()
      })
      .pipe(map((respuesta) => respuesta.data.user));
  }

  refrescarSesion(): void {
    const sesion = this.sesionSubject.value;

    if (!sesion?.token) {
      return;
    }

    this.obtenerPerfil().subscribe({
      next: (user) => {
        this.persistirSesion({ ...sesion, email: user.email, user });
      },
      error: (error: { status?: number }) => {
        if (error?.status === 401) {
          this.limpiarSesionLocal();
        }
      }
    });
  }

  /**
   * Revoca la sesión en el servidor (POST /api/auth/logout) y limpia todo el
   * estado local de Trender. La limpieza local ocurre aunque el servidor no responda.
   */
  cerrarSesion(): void {
    const token = this.obtenerToken();
    if (token) {
      this.http
        .post(`${AUTH_URL}/logout`, {}, { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) })
        .subscribe({ error: () => undefined });
    }
    this.limpiarSesionLocal();
  }

  obtenerToken(): string {
    return this.sesionSubject.value?.token ?? '';
  }

  /** Cabecera Authorization lista para las peticiones protegidas. */
  cabecerasAuth(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.obtenerToken()}` });
  }

  private limpiarSesionLocal(): void {
    const storage = this.getStorage();
    try {
      if (storage) {
        const claves: string[] = [];
        for (let i = 0; i < storage.length; i += 1) {
          const clave = storage.key(i);
          if (clave?.startsWith(STORAGE_PREFIX)) {
            claves.push(clave);
          }
        }
        claves.forEach((clave) => storage.removeItem(clave));
      }
    } catch {
      // Almacenamiento no disponible
    }
    this.sesionSubject.next(null);
  }

  private guardarSesion(respuesta: AuthResponse): void {
    const { user, token, expires_at } = respuesta.data;
    this.persistirSesion({
      sesionIniciada: true,
      email: user.email,
      token,
      expiresAt: expires_at,
      user
    });
  }

  private persistirSesion(sesion: StoredSession): void {
    try {
      this.getStorage()?.setItem(AUTH_STORAGE_KEY, JSON.stringify(sesion));
    } catch {
      // Almacenamiento no disponible o sin cuota: la sesión continúa en memoria
    }
    this.sesionSubject.next(sesion);
  }

  private leerSesion(): StoredSession | null {
    try {
      const raw = this.getStorage()?.getItem(AUTH_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const sesion = JSON.parse(raw) as Partial<StoredSession>;

      if (
        !sesion.sesionIniciada ||
        typeof sesion.email !== 'string' ||
        !sesion.email.trim() ||
        typeof sesion.token !== 'string' ||
        !sesion.token
      ) {
        return null;
      }

      if (sesion.expiresAt && new Date(sesion.expiresAt).getTime() <= Date.now()) {
        this.getStorage()?.removeItem(AUTH_STORAGE_KEY);
        return null;
      }

      return {
        sesionIniciada: true,
        email: sesion.email,
        token: sesion.token,
        expiresAt: sesion.expiresAt,
        user: sesion.user
      };
    } catch {
      this.getStorage()?.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
  }

  private getStorage(): Storage | null {
    try {
      return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
    } catch {
      return null;
    }
  }
}
