import { Genero, Medidas, estimarContornos } from './cuerpo';
import { CategoriaPrenda } from './prendas';

export type Talla = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

export interface Recomendacion {
  talla: string;
  /** Medida usada para decidir, p. ej. "pecho 96 cm". */
  base: string;
  nota: string | null;
}

const TALLAS: Talla[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// Límite superior (cm, exclusivo) de cada talla salvo la última. Guía de tallas genérica.
const TABLAS: Record<Genero, { superior: number[]; inferior: number[] }> = {
  Masculino: { superior: [88, 96, 104, 112, 120], inferior: [72, 79, 86, 94, 102] }, // pecho / cintura
  Femenino: { superior: [82, 88, 94, 102, 110], inferior: [88, 94, 100, 107, 115] }, // busto / cadera
};

function tallaPara(valor: number, limites: number[]): { talla: Talla; cerca: Talla | null } {
  const indice = limites.findIndex((limite) => valor < limite);
  const i = indice === -1 ? TALLAS.length - 1 : indice;
  // A menos de 1.5 cm del siguiente corte: está entre dos tallas.
  const siguiente = limites[i];
  const cerca = siguiente !== undefined && siguiente - valor <= 1.5 ? TALLAS[i + 1] : null;
  return { talla: TALLAS[i], cerca };
}

/** Talla recomendada para una prenda según las medidas (reales o estimadas). */
export function recomendarTalla(medidas: Medidas, categoria: CategoriaPrenda): Recomendacion {
  const c = estimarContornos(medidas);
  const tabla = TABLAS[medidas.genero];
  const aprox = c.estimados ? ' (estimada)' : '';

  if (categoria === 'Calzado') {
    // Largo de pie ≈ 15.2 % de la altura; la talla MX se expresa en cm.
    const pie = Math.round(medidas.altura * 0.152 * 2) / 2;
    return { talla: `MX ${pie}`, base: `altura ${Math.round(medidas.altura)} cm`, nota: 'Aproximada: mide tu pie para mayor precisión.' };
  }

  let medida: { nombre: string; valor: number; limites: number[] };
  if (categoria === 'Piernas') {
    medida =
      medidas.genero === 'Femenino'
        ? { nombre: 'cadera', valor: c.cadera, limites: tabla.inferior }
        : { nombre: 'cintura', valor: c.cintura, limites: tabla.inferior };
  } else {
    medida = { nombre: medidas.genero === 'Femenino' ? 'busto' : 'pecho', valor: c.pecho, limites: tabla.superior };
  }
  if (categoria === 'Vestido') {
    // Un vestido debe entrar en busto y cadera: manda la mayor de las dos tallas.
    const porCadera = tallaPara(c.cadera, TABLAS.Femenino.inferior);
    const porBusto = tallaPara(c.pecho, TABLAS.Femenino.superior);
    const mayor = TALLAS.indexOf(porCadera.talla) > TALLAS.indexOf(porBusto.talla) ? porCadera : porBusto;
    return {
      talla: mayor.talla,
      base: `busto ${c.pecho} / cadera ${c.cadera} cm${aprox}`,
      nota: mayor.cerca ? `Entre ${mayor.talla} y ${mayor.cerca}: elige ${mayor.cerca} para un ajuste holgado.` : null,
    };
  }

  const { talla, cerca } = tallaPara(medida.valor, medida.limites);
  return {
    talla,
    base: `${medida.nombre} ${medida.valor} cm${aprox}`,
    nota: cerca ? `Entre ${talla} y ${cerca}: elige ${cerca} para un ajuste holgado.` : null,
  };
}
