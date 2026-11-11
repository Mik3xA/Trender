/**
 * Modelo antropométrico del probador: de género, altura, peso y tipo de cuerpo
 * se estiman pecho, cintura y cadera (si el usuario no los indica) y las
 * proporciones que el motor 3D necesita. Sin dependencias de Three.js para
 * poder probarlo sin WebGL.
 */

export type Genero = 'Femenino' | 'Masculino';

export type TipoCuerpo = 'rectangulo' | 'triangulo' | 'triangulo-invertido' | 'reloj-de-arena' | 'ovalo';

export interface Medidas {
  genero: Genero;
  /** cm */
  altura: number;
  /** kg */
  peso: number;
  tipoCuerpo: TipoCuerpo;
  /** Medidas exactas opcionales (cm). Si faltan se estiman. */
  pecho?: number | null;
  cintura?: number | null;
  cadera?: number | null;
}

export interface TipoCuerpoInfo {
  id: TipoCuerpo;
  nombre: string;
  descripcion: string;
}

export const TIPOS_CUERPO: readonly TipoCuerpoInfo[] = [
  { id: 'rectangulo', nombre: 'Rectángulo', descripcion: 'Hombros, cintura y cadera similares' },
  { id: 'triangulo', nombre: 'Triángulo', descripcion: 'Cadera más ancha que los hombros' },
  { id: 'triangulo-invertido', nombre: 'Triángulo invertido', descripcion: 'Hombros y pecho más anchos' },
  { id: 'reloj-de-arena', nombre: 'Reloj de arena', descripcion: 'Cintura marcada, pecho y cadera parejos' },
  { id: 'ovalo', nombre: 'Óvalo', descripcion: 'Volumen en el abdomen' },
];

export const LIMITES = {
  altura: { min: 140, max: 210 },
  peso: { min: 35, max: 180 },
  contorno: { min: 50, max: 180 },
} as const;

export const MEDIDAS_INICIALES: Record<Genero, Medidas> = {
  Femenino: { genero: 'Femenino', altura: 163, peso: 58, tipoCuerpo: 'reloj-de-arena' },
  Masculino: { genero: 'Masculino', altura: 176, peso: 74, tipoCuerpo: 'rectangulo' },
};

// Contornos de referencia como fracción de la altura y su variación por punto de IMC.
const BASE: Record<Genero, { imc: number; pecho: number; cintura: number; cadera: number; dPecho: number; dCintura: number; dCadera: number }> = {
  Femenino: { imc: 21.8, pecho: 0.54, cintura: 0.43, cadera: 0.59, dPecho: 1.9, dCintura: 2.4, dCadera: 2.0 },
  Masculino: { imc: 22.9, pecho: 0.545, cintura: 0.465, cadera: 0.55, dPecho: 2.0, dCintura: 2.6, dCadera: 1.8 },
};

// Cómo cada tipo de cuerpo redistribuye el volumen (multiplicadores).
const FORMA: Record<TipoCuerpo, { pecho: number; cintura: number; cadera: number; hombros: number }> = {
  rectangulo: { pecho: 1.0, cintura: 1.04, cadera: 0.98, hombros: 1.0 },
  triangulo: { pecho: 0.95, cintura: 0.98, cadera: 1.07, hombros: 0.95 },
  'triangulo-invertido': { pecho: 1.07, cintura: 0.98, cadera: 0.95, hombros: 1.08 },
  'reloj-de-arena': { pecho: 1.03, cintura: 0.9, cadera: 1.04, hombros: 1.0 },
  ovalo: { pecho: 1.03, cintura: 1.13, cadera: 1.0, hombros: 1.0 },
};

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const redondear = (v: number) => Math.round(v * 2) / 2;

export function imc(m: Pick<Medidas, 'altura' | 'peso'>): number {
  const metros = m.altura / 100;
  return m.peso / (metros * metros);
}

function valido(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= LIMITES.contorno.min && v <= LIMITES.contorno.max;
}

/** Pecho, cintura y cadera (cm): los indicados por el usuario o estimados. */
export function estimarContornos(m: Medidas): { pecho: number; cintura: number; cadera: number; estimados: boolean } {
  const base = BASE[m.genero];
  const forma = FORMA[m.tipoCuerpo];
  const delta = limitar(imc(m), 15, 45) - base.imc;
  const estimado = {
    pecho: redondear((m.altura * base.pecho + delta * base.dPecho) * forma.pecho),
    cintura: redondear((m.altura * base.cintura + delta * base.dCintura) * forma.cintura),
    cadera: redondear((m.altura * base.cadera + delta * base.dCadera) * forma.cadera),
  };
  return {
    pecho: valido(m.pecho) ? m.pecho : estimado.pecho,
    cintura: valido(m.cintura) ? m.cintura : estimado.cintura,
    cadera: valido(m.cadera) ? m.cadera : estimado.cadera,
    estimados: !(valido(m.pecho) && valido(m.cintura) && valido(m.cadera)),
  };
}

/** Semiejes de una elipse a partir de su perímetro (aprox. de Ramanujan) y la razón fondo/ancho. */
export function semiejes(perimetro: number, razon: number): { ancho: number; fondo: number } {
  const k = Math.PI * (3 * (1 + razon) - Math.sqrt((3 + razon) * (1 + 3 * razon)));
  const ancho = perimetro / k;
  return { ancho, fondo: ancho * razon };
}

/** Todo en metros. y = 0 en el suelo. */
export interface Proporciones {
  altura: number;
  femenino: boolean;
  hombros: number; // semiancho
  pecho: { ancho: number; fondo: number };
  cintura: { ancho: number; fondo: number };
  cadera: { ancho: number; fondo: number };
  /** Volumen extra al frente del pecho (busto) y atrás de la cadera (glúteo), 0..1. */
  busto: number;
  gluteo: number;
  vientre: number;
  /** Grosor relativo de extremidades según el peso. */
  masa: number;
  y: {
    tobillo: number;
    rodilla: number;
    entrepierna: number;
    cadera: number;
    cintura: number;
    pecho: number;
    axila: number;
    hombro: number;
    cuello: number;
    barbilla: number;
    cabeza: number;
    codo: number;
    muneca: number;
  };
}

export function calcularProporciones(m: Medidas): Proporciones {
  const altura = limitar(m.altura, LIMITES.altura.min, LIMITES.altura.max) / 100;
  const femenino = m.genero === 'Femenino';
  const contornos = estimarContornos(m);
  const forma = FORMA[m.tipoCuerpo];
  const indice = limitar(imc(m), 15, 45);

  const pecho = semiejes(contornos.pecho / 100, femenino ? 0.74 : 0.68);
  const cintura = semiejes(contornos.cintura / 100, m.tipoCuerpo === 'ovalo' ? 0.86 : 0.74);
  const cadera = semiejes(contornos.cadera / 100, femenino ? 0.76 : 0.7);
  const hombros = altura * (femenino ? 0.118 : 0.132) * forma.hombros * (0.94 + (indice - 22) * 0.008);

  return {
    altura,
    femenino,
    hombros: Math.max(hombros, pecho.ancho * 1.12),
    pecho,
    cintura,
    cadera,
    busto: femenino ? limitar(0.45 + (contornos.pecho - contornos.cintura - 14) * 0.02, 0.25, 0.9) : 0.12,
    gluteo: femenino ? limitar(0.45 + (contornos.cadera - contornos.cintura - 20) * 0.015, 0.3, 0.85) : 0.3,
    vientre: limitar((contornos.cintura - contornos.cadera * 0.82) / 40, 0, 0.5),
    masa: limitar(0.85 + (indice - 22) * 0.035, 0.75, 1.6),
    y: {
      tobillo: altura * 0.045,
      rodilla: altura * 0.285,
      entrepierna: altura * (femenino ? 0.465 : 0.475),
      cadera: altura * 0.52,
      cintura: altura * (femenino ? 0.625 : 0.61),
      pecho: altura * 0.72,
      axila: altura * 0.755,
      hombro: altura * 0.815,
      cuello: altura * 0.845,
      barbilla: altura * 0.87,
      cabeza: altura * 0.935,
      codo: altura * 0.625,
      muneca: altura * 0.48,
    },
  };
}

/** Interpola entre dos juegos de medidas (para animar cambios del cuerpo). */
export function interpolarMedidas(a: Medidas, b: Medidas, t: number): Medidas {
  const ca = estimarContornos(a);
  const cb = estimarContornos(b);
  const mezcla = (x: number, y: number) => x + (y - x) * t;
  return {
    genero: t < 0.5 ? a.genero : b.genero,
    tipoCuerpo: t < 0.5 ? a.tipoCuerpo : b.tipoCuerpo,
    altura: mezcla(a.altura, b.altura),
    peso: mezcla(a.peso, b.peso),
    pecho: mezcla(ca.pecho, cb.pecho),
    cintura: mezcla(ca.cintura, cb.cintura),
    cadera: mezcla(ca.cadera, cb.cadera),
  };
}

/** Normaliza datos guardados (localStorage o backend) a unas medidas válidas. */
export function sanearMedidas(datos: Partial<Medidas> | null | undefined): Medidas {
  const genero: Genero = datos?.genero === 'Masculino' || datos?.genero === 'Femenino' ? datos.genero : 'Femenino';
  const base = MEDIDAS_INICIALES[genero];
  const numero = (v: unknown, min: number, max: number, defecto: number) =>
    typeof v === 'number' && Number.isFinite(v) ? limitar(v, min, max) : defecto;
  const tipo = TIPOS_CUERPO.some((t) => t.id === datos?.tipoCuerpo) ? (datos!.tipoCuerpo as TipoCuerpo) : base.tipoCuerpo;
  const contorno = (v: unknown) => (valido(v as number) ? (v as number) : null);
  return {
    genero,
    altura: numero(datos?.altura, LIMITES.altura.min, LIMITES.altura.max, base.altura),
    peso: numero(datos?.peso, LIMITES.peso.min, LIMITES.peso.max, base.peso),
    tipoCuerpo: tipo,
    pecho: contorno(datos?.pecho),
    cintura: contorno(datos?.cintura),
    cadera: contorno(datos?.cadera),
  };
}
