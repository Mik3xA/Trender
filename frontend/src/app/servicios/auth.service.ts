import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export type AuthMethod = 'otp' | 'password';

export interface AuthUser {
  id: string;
  nombre: string;
  email: string;
  creadoEn?: string;
}

export interface AuthResponse {
  status: string;
  token: string;
  user: AuthUser;
}

export interface StoredSession {
  sesionIniciada: boolean;
  email: string;
  metodo: AuthMethod;
  token: string;
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
const AUTH_URL = `${environment.apiUrl}/api/auth`;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sesionSubject = new BehaviorSubject<StoredSession | null>(this.leerSesion());

  readonly sesion$ = this.sesionSubject.asObservable();

  constructor(private http: HttpClient) {}

  get sesionActual(): StoredSession | null {
    return this.sesionSubject.value;
  }

  solicitarCodigo(email: string): Observable<{ status: string; message: string }> {
    return this.http.post<{ status: string; message: string }>(`${AUTH_URL}/solicitar-codigo`, {
      email
    });
  }

  verificarCodigo(email: string, codigo: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${AUTH_URL}/verificar-codigo`, { email, codigo })
      .pipe(tap((respuesta) => this.guardarSesion('otp', respuesta)));
  }

  registrar(payload: RegistroPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${AUTH_URL}/registro`, payload)
      .pipe(tap((respuesta) => this.guardarSesion('password', respuesta)));
  }

  iniciarSesion(payload: LoginPayload): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${AUTH_URL}/login`, payload)
      .pipe(tap((respuesta) => this.guardarSesion('password', respuesta)));
  }

  obtenerPerfil(): Observable<{ status: string; user: AuthUser }> {
    const token = this.sesionSubject.value?.token ?? '';
    return this.http.get<{ status: string; user: AuthUser }>(`${AUTH_URL}/me`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
    });
  }

  refrescarSesion(): void {
    const sesion = this.sesionSubject.value;

    if (!sesion?.token) {
      return;
    }

    this.obtenerPerfil().subscribe({
      next: ({ user }) => {
        const actualizada: StoredSession = {
          ...sesion,
          email: user.email,
          user
        };
        this.persistirSesion(actualizada);
      },
      error: (error: { status?: number }) => {
        if (error?.status === 401) {
          this.cerrarSesion();
        }
      }
    });
  }

  cerrarSesion(): void {
    try {
      this.getStorage()?.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Almacenamiento no disponible
    }
    this.sesionSubject.next(null);
  }

  obtenerToken(): string {
    return this.sesionSubject.value?.token ?? '';
  }

  private guardarSesion(metodo: AuthMethod, respuesta: AuthResponse): void {
    const sesion: StoredSession = {
      sesionIniciada: true,
      email: respuesta.user?.email ?? '',
      metodo,
      token: respuesta.token,
      user: respuesta.user
    };

    this.persistirSesion(sesion);
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

      if (!sesion.sesionIniciada || typeof sesion.email !== 'string' || !sesion.email.trim()) {
        return null;
      }

      const metodo: AuthMethod =
        sesion.metodo === 'otp' || sesion.metodo === 'password' ? sesion.metodo : 'otp';

      return {
        sesionIniciada: true,
        email: sesion.email,
        metodo,
        token: typeof sesion.token === 'string' ? sesion.token : '',
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
