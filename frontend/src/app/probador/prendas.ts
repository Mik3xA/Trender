/** Prendas del armario: categorías, tipos, partes del cuerpo y nombres para mostrar. */

export type CategoriaArmario = 'top' | 'bottom' | 'dress' | 'shoes' | 'outfit';
/** Parte del cuerpo que ocupa una prenda (un outfit puede ocupar varias). */
export type Parte = 'top' | 'bottom' | 'dress' | 'shoes';

/** Respuestas del cuestionario de la prenda (le dicen a la IA cómo es puesta). */
export interface AjustesPrenda {
  ajuste?: 'ajustado' | 'regular' | 'holgado';
  largo?: 'corto' | 'normal' | 'largo';
  manga?: 'sin' | 'corta' | 'tres-cuartos' | 'larga';
  capucha?: boolean;
  cuello?: boolean;
  /** Outfit completo: qué partes usar. */
  usar?: Parte[];
}

export const TIPOS_POR_CATEGORIA: Record<CategoriaArmario, string[]> = {
  top: ['camiseta', 'camisa', 'blusa', 'top', 'sueter', 'sudadera', 'chamarra', 'blazer', 'abrigo'],
  bottom: ['pantalon', 'jeans', 'jogger', 'leggings', 'short', 'falda'],
  dress: ['vestido'],
  shoes: ['tenis', 'zapatos', 'botas', 'sandalias'],
  outfit: ['outfit'],
};

export const NOMBRE_CATEGORIA: Record<CategoriaArmario, string> = {
  top: 'Superior',
  bottom: 'Inferior',
  dress: 'Vestido',
  shoes: 'Calzado',
  outfit: 'Outfit',
};

export const NOMBRE_PARTE: Record<Parte, string> = {
  top: 'Arriba',
  bottom: 'Abajo',
  dress: 'Vestido',
  shoes: 'Calzado',
};

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
  outfit: 'Outfit completo',
};

export const PARTES_OUTFIT: Parte[] = ['top', 'bottom', 'shoes'];

export function categoriaDeTipo(tipo: string): CategoriaArmario | null {
  return (Object.keys(TIPOS_POR_CATEGORIA) as CategoriaArmario[]).find((c) => TIPOS_POR_CATEGORIA[c].includes(tipo)) ?? null;
}

/** Partes del cuerpo que ocupa una prenda al probársela (igual que el backend). */
export function partesDe(categoria: CategoriaArmario | null, usar?: Parte[] | null): Parte[] {
  if (!categoria) return [];
  if (categoria === 'outfit') return usar?.length ? usar : PARTES_OUTFIT;
  // Un vestido cubre arriba y abajo.
  return categoria === 'dress' ? ['top', 'bottom'] : [categoria];
}
