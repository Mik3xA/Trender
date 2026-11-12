/** Prendas que el probador sabe vestir y cómo se representan en 3D. */

export type CategoriaPrenda = 'Torso' | 'Piernas' | 'Calzado' | 'Vestido';

export type Tela = 'punto' | 'tejido' | 'mezclilla' | 'felpa' | 'lana' | 'piel' | 'lona' | 'satin';

/** Estilo geométrico de la prenda en el avatar. */
export interface Estilo {
  /** Hasta dónde llega (fracción de la altura). */
  largo: number;
  /** Manga: 0 sin manga, 0.3 corta, 1 larga. */
  manga: number;
  /** Holgura sobre el cuerpo (1 = ceñida). */
  holgura: number;
  /** Vuelo inferior (faldas, abrigos). */
  vuelo: number;
  tela: Tela;
  capucha?: boolean;
  cuello?: boolean;
  /** Calzado: altura de la caña (fracción de la altura). */
  cana?: number;
  /** Holgura mínima de la cintura para abajo: una prenda superior cubre al pantalón que lleva debajo. */
  holguraCadera?: number;
  /** Bajo y puños con resorte (sudaderas, suéteres, pants): se ciñen al cuerpo. */
  resorte?: boolean;
}

/** Respuestas del cuestionario de la prenda: cómo queda puesta. */
export interface AjustesPrenda {
  ajuste?: 'ajustado' | 'regular' | 'holgado';
  largo?: 'corto' | 'normal' | 'largo';
  manga?: 'sin' | 'corta' | 'tres-cuartos' | 'larga';
  capucha?: boolean;
  cuello?: boolean;
}

export interface PrendaVirtual {
  id: string;
  nombre: string;
  categoria: CategoriaPrenda;
  tipo: string;
  color: string;
  colorNombre?: string;
  tienda?: string | null;
  precio?: string | null;
  imagen?: string | null;
  /** Zonas de la foto (0..1) para proyectar torso y mangas por separado. */
  zonas?: {
    prenda: { x0: number; y0: number; x1: number; y1: number };
    torso?: { x0: number; y0: number; x1: number; y1: number };
    mangaIzquierda?: { x0: number; y0: number; x1: number; y1: number };
    mangaDerecha?: { x0: number; y0: number; x1: number; y1: number };
  };
  /** Tela detectada en la foto (si se reconoció, p. ej. mezclilla). */
  tela?: Tela;
  /** 'liso', 'rayas…' o 'estampado' (un estampado no se repite en la espalda). */
  estampado?: string | null;
  /** Calzado: la punta del zapato mira a la derecha en la foto. */
  puntaDerecha?: boolean;
  /** Cuestionario (o lo detectado en la foto): ajuste, largo, manga, capucha, cuello. */
  ajustes?: AjustesPrenda;
}

/** Prenda tal como la devuelve POST /api/ropa/escanear-link. */
export interface PrendaEscaneada {
  id: string;
  nombre: string;
  categoria: CategoriaPrenda | null;
  tipo: string | null;
  confianza: 'alta' | 'media' | 'baja' | 'ninguna';
  color: { nombre: string; hex: string } | null;
  precio: string | null;
  marca: string | null;
  imagen: string | null;
  tienda: string;
  fuente: 'pagina' | 'url';
  motivo: string | null;
}

/** Nombre para mostrar de cada tipo ("jogger" se conoce como "pants"). */
export const NOMBRE_TIPO: Record<string, string> = {
  camiseta: 'Playera',
  camisa: 'Camisa',
  blusa: 'Blusa',
  top: 'Top',
  sueter: 'Suéter',
  sudadera: 'Sudadera',
  chamarra: 'Chamarra',
  blazer: 'Saco',
  abrigo: 'Abrigo',
  pantalon: 'Pantalón',
  jeans: 'Jeans',
  jogger: 'Pants',
  leggings: 'Leggings',
  short: 'Short',
  falda: 'Falda',
  vestido: 'Vestido',
  tenis: 'Tenis',
  zapatos: 'Zapatos',
  botas: 'Botas',
  sandalias: 'Sandalias',
};

export const ESTILOS: Record<string, Estilo> = {
  camiseta: { largo: 0.5, manga: 0.32, holgura: 1.05, vuelo: 0, tela: 'punto' },
  camisa: { largo: 0.49, manga: 1, holgura: 1.06, vuelo: 0.02, tela: 'tejido', cuello: true },
  blusa: { largo: 0.52, manga: 0.75, holgura: 1.07, vuelo: 0.04, tela: 'satin' },
  top: { largo: 0.64, manga: 0, holgura: 1.02, vuelo: 0, tela: 'punto' },
  sueter: { largo: 0.5, manga: 1, holgura: 1.09, vuelo: 0, tela: 'lana', resorte: true },
  sudadera: { largo: 0.5, manga: 1, holgura: 1.11, vuelo: 0, tela: 'felpa', capucha: true, resorte: true },
  chamarra: { largo: 0.5, manga: 1, holgura: 1.13, vuelo: 0.02, tela: 'lona', cuello: true },
  blazer: { largo: 0.46, manga: 1, holgura: 1.08, vuelo: 0.03, tela: 'tejido', cuello: true },
  abrigo: { largo: 0.3, manga: 1, holgura: 1.15, vuelo: 0.08, tela: 'lana', cuello: true },
  pantalon: { largo: 0.04, manga: 0, holgura: 1.08, vuelo: 0.02, tela: 'tejido' },
  jeans: { largo: 0.04, manga: 0, holgura: 1.05, vuelo: 0, tela: 'mezclilla' },
  jogger: { largo: 0.05, manga: 0, holgura: 1.12, vuelo: 0, tela: 'felpa', resorte: true },
  leggings: { largo: 0.05, manga: 0, holgura: 1.015, vuelo: 0, tela: 'punto' },
  short: { largo: 0.38, manga: 0, holgura: 1.1, vuelo: 0.02, tela: 'tejido' },
  falda: { largo: 0.3, manga: 0, holgura: 1.04, vuelo: 0.07, tela: 'tejido' },
  vestido: { largo: 0.27, manga: 0, holgura: 1.04, vuelo: 0.09, tela: 'satin' },
  tenis: { largo: 0, manga: 0, holgura: 1.12, vuelo: 0, tela: 'lona', cana: 0.055 },
  botas: { largo: 0, manga: 0, holgura: 1.12, vuelo: 0, tela: 'piel', cana: 0.2 },
  sandalias: { largo: 0, manga: 0, holgura: 1.06, vuelo: 0, tela: 'piel', cana: 0.015 },
  zapatos: { largo: 0, manga: 0, holgura: 1.08, vuelo: 0, tela: 'piel', cana: 0.04 },
};

/** Tipo por defecto de cada categoría (cuando el escáner no lo sabe o el usuario elige). */
export const TIPO_POR_CATEGORIA: Record<CategoriaPrenda, string> = {
  Torso: 'camiseta',
  Piernas: 'pantalon',
  Calzado: 'tenis',
  Vestido: 'vestido',
};

export const COLOR_POR_DEFECTO: Record<CategoriaPrenda, string> = {
  Torso: '#e9e6df',
  Piernas: '#3b4a5c',
  Calzado: '#f1efea',
  Vestido: '#3f4e3b',
};

export const NOMBRE_CATEGORIA: Record<CategoriaPrenda, string> = {
  Torso: 'Superior',
  Piernas: 'Inferior',
  Calzado: 'Calzado',
  Vestido: 'Vestido',
};

const MANGA: Record<NonNullable<AjustesPrenda['manga']>, number> = { sin: 0, corta: 0.32, 'tres-cuartos': 0.7, larga: 1 };

/**
 * Estilo 3D de una prenda: el de su tipo, ajustado con las respuestas del
 * cuestionario (holgura, largo del bajo, manga, capucha, cuello) y la tela detectada.
 */
export function estiloDe(prenda: Pick<PrendaVirtual, 'tipo' | 'categoria'> & { tela?: Tela; ajustes?: AjustesPrenda }): Estilo {
  const base = ESTILOS[prenda.tipo] ?? ESTILOS[TIPO_POR_CATEGORIA[prenda.categoria]];
  const estilo: Estilo = { ...base, ...(prenda.tela ? { tela: prenda.tela } : {}) };
  const a = prenda.ajustes;
  if (!a) return estilo;

  if (a.ajuste === 'ajustado') estilo.holgura = Math.max(1.015, base.holgura - 0.04);
  if (a.ajuste === 'holgado') estilo.holgura = base.holgura + 0.05;

  const esFalda = prenda.tipo === 'falda' || prenda.categoria === 'Vestido';
  if (a.largo && a.largo !== 'normal' && prenda.categoria !== 'Calzado') {
    const corto = a.largo === 'corto';
    if (prenda.categoria === 'Torso') estilo.largo = base.largo + (corto ? 0.055 : -0.07);
    else if (esFalda) estilo.largo = corto ? 0.4 : 0.1;
    else if (prenda.tipo === 'short') estilo.largo = corto ? 0.43 : 0.33;
    else estilo.largo = corto ? 0.13 : 0.025; // pantalón al tobillo o hasta el suelo
  }
  if (a.manga && (prenda.categoria === 'Torso' || prenda.categoria === 'Vestido')) estilo.manga = MANGA[a.manga];
  if (a.capucha !== undefined && prenda.categoria === 'Torso') estilo.capucha = a.capucha;
  if (a.cuello !== undefined && prenda.categoria === 'Torso') estilo.cuello = a.cuello;
  return estilo;
}

/** Ranura del avatar que ocupa la prenda. Un vestido ocupa la superior y la inferior. */
export function ranurasDe(categoria: CategoriaPrenda): Array<'superior' | 'inferior' | 'calzado'> {
  switch (categoria) {
    case 'Torso':
      return ['superior'];
    case 'Piernas':
      return ['inferior'];
    case 'Calzado':
      return ['calzado'];
    default:
      return ['superior', 'inferior'];
  }
}

/** Agrega una prenda al conjunto quitando las que ocupan sus mismas ranuras. */
export function vestirConjunto(conjunto: PrendaVirtual[], prenda: PrendaVirtual): PrendaVirtual[] {
  const ocupadas = new Set(ranurasDe(prenda.categoria));
  return [...conjunto.filter((p) => !ranurasDe(p.categoria).some((r) => ocupadas.has(r))), prenda];
}

/** Convierte el resultado del escáner en una prenda vestible (la categoría puede venir del usuario). */
export function prendaDesdeEscaneo(e: PrendaEscaneada, categoriaElegida?: CategoriaPrenda): PrendaVirtual | null {
  const categoria = categoriaElegida ?? e.categoria;
  if (!categoria) return null;
  const tipoValido = e.tipo && ESTILOS[e.tipo] && (!categoriaElegida || categoriaElegida === e.categoria);
  return {
    id: e.id,
    nombre: e.nombre,
    categoria,
    tipo: tipoValido ? e.tipo! : TIPO_POR_CATEGORIA[categoria],
    color: e.color?.hex ?? COLOR_POR_DEFECTO[categoria],
    colorNombre: e.color?.nombre,
    tienda: e.tienda,
    precio: e.precio,
    imagen: e.imagen,
  };
}

/** Básicos para probar sin pegar un link. */
export const MUESTRAS: readonly PrendaVirtual[] = [
  { id: 'm-camiseta', nombre: 'Camiseta básica', categoria: 'Torso', tipo: 'camiseta', color: '#efede6', colorNombre: 'blanco' },
  { id: 'm-camisa', nombre: 'Camisa oxford', categoria: 'Torso', tipo: 'camisa', color: '#a9bfd6', colorNombre: 'celeste' },
  { id: 'm-sudadera', nombre: 'Sudadera con capucha', categoria: 'Torso', tipo: 'sudadera', color: '#8b8b88', colorNombre: 'gris' },
  { id: 'm-abrigo', nombre: 'Abrigo largo', categoria: 'Torso', tipo: 'abrigo', color: '#b0834f', colorNombre: 'camel' },
  { id: 'm-jeans', nombre: 'Jeans rectos', categoria: 'Piernas', tipo: 'jeans', color: '#3b5578', colorNombre: 'mezclilla' },
  { id: 'm-pantalon', nombre: 'Pantalón de vestir', categoria: 'Piernas', tipo: 'pantalon', color: '#2b2b2d', colorNombre: 'negro' },
  { id: 'm-falda', nombre: 'Falda midi', categoria: 'Piernas', tipo: 'falda', color: '#5b6236', colorNombre: 'oliva' },
  { id: 'm-vestido', nombre: 'Vestido midi', categoria: 'Vestido', tipo: 'vestido', color: '#5c1f2c', colorNombre: 'vino' },
  { id: 'm-tenis', nombre: 'Tenis blancos', categoria: 'Calzado', tipo: 'tenis', color: '#f1efea', colorNombre: 'blanco' },
  { id: 'm-botas', nombre: 'Botas de piel', categoria: 'Calzado', tipo: 'botas', color: '#3d2a1e', colorNombre: 'café' },
];
