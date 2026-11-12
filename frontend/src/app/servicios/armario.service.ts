import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap, take, takeWhile, timer } from 'rxjs';

import { environment } from '../../environments/environment';
import { AjustesPrenda, CategoriaArmario, Parte } from '../probador/prendas';

export type Genero = 'Femenino' | 'Masculino';

/** Lo que el servidor vio en la foto (análisis visual). */
export interface AnalisisVisual {
  categoria: string | null;
  tipo: string | null;
  confianza: 'alta' | 'media' | 'baja' | 'ninguna';
  nombreSugerido: string | null;
  sugerencias?: string[];
  detalle: {
    manga: 'sin' | 'corta' | 'tres-cuartos' | 'larga' | null;
    largo: string | null;
    tela: string | null;
    estampado: string | null;
    capucha?: boolean | null;
    abertura?: boolean | null;
    posibleOutfit?: boolean;
    colores: Array<{ hex: string; nombre: string; proporcion: number }>;
  };
}

/** Prenda del armario tal como la devuelve /api/closet. */
export interface PrendaArmario {
  id: string;
  genero: Genero;
  imagen_url: string | null;
  category: CategoriaArmario | null;
  tipo: string | null;
  nombre: string | null;
  color: string | null;
  status: 'pending' | 'processing' | 'ready' | 'review' | 'failed';
  error: string | null;
  ajustes?: AjustesPrenda | null;
  analisis: {
    origen?: string;
    confianza: 'alta' | 'media' | 'baja' | 'ninguna';
    evidencias: string[];
    avisos: string[];
    metodoRecorte: string | null;
    posibleOutfit?: boolean;
    visual?: AnalisisVisual | null;
  } | null;
  created_at: string;
}

const INTERVALO_MS = 1000;
const ESPERA_MAXIMA = 120; // consultas (≈ 2 min)

/**
 * Armario en el servidor. Subir una foto es asíncrono: POST devuelve 202 con la
 * prenda en "processing" y aquí se consulta cada segundo hasta que termina.
 */
@Injectable({ providedIn: 'root' })
export class ArmarioService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/api/closet`;

  listar(genero: Genero): Observable<PrendaArmario[]> {
    return this.http.get<{ data: { items: PrendaArmario[] } }>(this.url, { params: { genero } }).pipe(map((r) => r.data.items));
  }

  /** Sube la FOTO de una prenda; emite la prenda en cada consulta hasta que deja de estar "processing". */
  subirFoto(archivo: Blob, genero: Genero, opciones: { nombre?: string; tipo?: string } = {}): Observable<PrendaArmario> {
    const params: Record<string, string> = { genero };
    if (opciones.nombre?.trim()) params['nombre'] = opciones.nombre.trim().slice(0, 120);
    if (opciones.tipo) params['tipo'] = opciones.tipo;
    return this.http
      .post<{ data: PrendaArmario }>(`${this.url}/subir`, archivo, { params, headers: { 'Content-Type': tipoImagen(archivo) } })
      .pipe(switchMap(({ data }) => this.seguir(data.id)));
  }

  /** Cambia la foto de una prenda existente. */
  agregarFoto(id: string, archivo: Blob): Observable<PrendaArmario> {
    return this.http
      .post<{ data: PrendaArmario }>(`${this.url}/${id}/foto`, archivo, { headers: { 'Content-Type': tipoImagen(archivo) } })
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

  /** Categoría, tipo y respuestas del cuestionario. */
  clasificar(id: string, category: CategoriaArmario, tipo?: string, ajustes?: AjustesPrenda): Observable<PrendaArmario> {
    return this.http
      .patch<{ data: PrendaArmario }>(`${this.url}/${id}`, { category, ...(tipo ? { tipo } : {}), ...(ajustes ? { ajustes } : {}) })
      .pipe(map((r) => r.data));
  }

  eliminar(id: string): Observable<unknown> {
    return this.http.delete(`${this.url}/${id}`);
  }
}

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/heic', 'image/heif'];

export function tipoImagen(archivo: Blob): string {
  if (TIPOS_IMAGEN.includes(archivo.type)) return archivo.type;
  const nombre = (archivo as File).name?.toLowerCase() ?? '';
  if (/\.hei[cf]$/.test(nombre)) return 'image/heic';
  return 'image/jpeg';
}

export const LADO_MAXIMO_FOTO = 1600;

/**
 * Prepara una foto para subirla: la reduce a 1600 px como máximo y la
 * re-codifica (respeta la orientación EXIF y quita metadatos como el GPS).
 * Si el navegador no puede leerla (p. ej. HEIC en Chrome) se envía tal cual.
 */
export async function prepararFoto(archivo: File): Promise<Blob> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return archivo;
  try {
    const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    const escala = Math.min(1, LADO_MAXIMO_FOTO / Math.max(bitmap.width, bitmap.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    const ctx = lienzo.getContext('2d');
    if (!ctx) return archivo;
    ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    bitmap.close?.();
    const tipo = archivo.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, tipo, 0.9));
    return blob && blob.size > 0 ? blob : archivo;
  } catch {
    return archivo;
  }
}

/** URL pública del recorte de una prenda. */
export function urlPrenda(p: Pick<PrendaArmario, 'imagen_url'>): string | null {
  return p.imagen_url ? `${environment.apiUrl}${p.imagen_url}` : null;
}

export type { Parte };
