import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap, take, takeWhile, timer } from 'rxjs';

import { environment } from '../../environments/environment';
import { Genero } from '../probador/cuerpo';
import { CategoriaPrenda, COLOR_POR_DEFECTO, ESTILOS, PrendaVirtual, TIPO_POR_CATEGORIA, Tela } from '../probador/prendas';

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
    origen?: 'tienda' | 'foto subida' | 'foto añadida' | 'link de imagen';
    sinFoto?: boolean;
    confianza: 'alta' | 'media' | 'baja' | 'ninguna';
    evidencias: string[];
    avisos: string[];
    metodoRecorte: string | null;
    visual?: AnalisisVisual | null;
  } | null;
  created_at: string;
}

export interface Zona {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Zonas de la foto (0..1): la prenda completa y, en prendas con manga, el torso y cada manga. */
export interface ZonasFoto {
  prenda: Zona;
  torso?: Zona;
  mangaIzquierda?: Zona;
  mangaDerecha?: Zona;
}

/** Lo que el servidor vio en la foto (análisis visual). */
export interface AnalisisVisual {
  categoria: CategoriaPrenda | null;
  tipo: string | null;
  confianza: 'alta' | 'media' | 'baja' | 'ninguna';
  puntos: Record<CategoriaPrenda, number>;
  nombreSugerido: string | null;
  detalle: {
    manga: 'sin' | 'corta' | 'larga' | null;
    largo: string | null;
    tela: Tela | null;
    estampado: string | null;
    colores: Array<{ hex: string; nombre: string; proporcion: number }>;
  };
  zonas: ZonasFoto;
  rasgos?: { desplazamientoArriba?: number };
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

  /** Sube la FOTO de una prenda; se analiza en el servidor igual que un link. */
  subirFoto(archivo: Blob, genero: Genero, nombre?: string): Observable<PrendaArmario> {
    const params: Record<string, string> = { genero };
    if (nombre?.trim()) params['nombre'] = nombre.trim().slice(0, 120);
    return this.http
      .post<{ data: PrendaArmario }>(`${this.url}/subir`, archivo, { params, headers: { 'Content-Type': tipoImagen(archivo) } })
      .pipe(switchMap(({ data }) => this.seguir(data.id)));
  }

  /** Añade (o cambia) la foto de una prenda existente, p. ej. un link sin foto. */
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

  clasificar(id: string, category: CategoriaArmario, tipo?: string): Observable<PrendaArmario> {
    return this.http
      .patch<{ data: PrendaArmario }>(`${this.url}/${id}`, tipo ? { category, tipo } : { category })
      .pipe(map((r) => r.data));
  }

  eliminar(id: string): Observable<unknown> {
    return this.http.delete(`${this.url}/${id}`);
  }
}

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/heic', 'image/heif'];

function tipoImagen(archivo: Blob): string {
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
    // PNG conserva la transparencia de las fotos que ya vienen recortadas.
    const tipo = archivo.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, tipo, 0.9));
    return blob && blob.size > 0 ? blob : archivo;
  } catch {
    return archivo;
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
    zonas: p.analisis?.visual?.zonas,
    tela: p.analisis?.visual?.detalle.tela ?? undefined,
    estampado: p.analisis?.visual?.detalle.estampado ?? null,
    // La caña/talón (parte alta) a la izquierda de la foto => la punta mira a la derecha.
    puntaDerecha: (p.analisis?.visual?.rasgos?.desplazamientoArriba ?? 0) < 0,
  };
}
