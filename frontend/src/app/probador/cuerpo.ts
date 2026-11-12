/**
 * Modelo antropométrico del probador: de género, altura, peso y tipo de cuerpo
 * se estiman pecho, cintura y cadera (si el usuario no los indica) y las
 * proporciones que el motor 3D necesita. Sin dependencias de Three.js para
 * poder probarlo sin WebGL.
 */

export type Genero = 'Femenino' | 'Masculino';

export type TipoCuerpo = 'fit' | 'delgado' | 'normal' | 'sobrepeso';

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
  { id: 'fit', nombre: 'Fit', descripcion: 'Hombros y pecho marcados, cintura estrecha, más músculo' },
  { id: 'delgado', nombre: 'Delgado', descripcion: 'Complexión ligera y contornos finos' },
  { id: 'normal', nombre: 'Normal', descripcion: 'Proporciones promedio' },
  { id: 'sobrepeso', nombre: 'Sobrepeso', descripcion: 'Más volumen en abdomen, pecho y cadera' },
];

/** Tipos del probador anterior -> tipos actuales (datos guardados). */
const TIPOS_ANTERIORES: Record<string, TipoCuerpo> = {
  rectangulo: 'normal',
  triangulo: 'normal',
  'reloj-de-arena': 'normal',
  'triangulo-invertido': 'fit',
  ovalo: 'sobrepeso',
};

export const LIMITES = {
  altura: { min: 140, max: 210 },
  peso: { min: 35, max: 180 },
  contorno: { min: 50, max: 180 },
} as const;

export const MEDIDAS_INICIALES: Record<Genero, Medidas> = {
  Femenino: { genero: 'Femenino', altura: 163, peso: 58, tipoCuerpo: 'normal' },
  Masculino: { genero: 'Masculino', altura: 176, peso: 74, tipoCuerpo: 'normal' },
};

// Contornos de referencia como fracción de la altura y su variación por punto de IMC.
const BASE: Record<Genero, { imc: number; pecho: number; cintura: number; cadera: number; dPecho: number; dCintura: number; dCadera: number }> = {
  Femenino: { imc: 21.8, pecho: 0.54, cintura: 0.43, cadera: 0.59, dPecho: 1.9, dCintura: 2.4, dCadera: 2.0 },
  Masculino: { imc: 22.9, pecho: 0.545, cintura: 0.465, cadera: 0.55, dPecho: 2.0, dCintura: 2.6, dCadera: 1.8 },
};

// Cómo cada tipo de cuerpo redistribuye el volumen (multiplicadores) y el músculo de brazos y piernas.
const FORMA: Record<TipoCuerpo, { pecho: number; cintura: number; cadera: number; hombros: number; musculo: number }> = {
  fit: { pecho: 1.06, cintura: 0.92, cadera: 0.97, hombros: 1.09, musculo: 1.14 },
  delgado: { pecho: 0.94, cintura: 0.93, cadera: 0.95, hombros: 0.96, musculo: 0.9 },
  normal: { pecho: 1.0, cintura: 1.0, cadera: 1.0, hombros: 1.0, musculo: 1.0 },
  sobrepeso: { pecho: 1.06, cintura: 1.15, cadera: 1.06, hombros: 1.02, musculo: 1.04 },
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
  /** Volumen muscular de brazos y piernas según el tipo de cuerpo. */
  musculo: number;
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
  const cintura = semiejes(contornos.cintura / 100, m.tipoCuerpo === 'sobrepeso' ? 0.86 : 0.74);
  const cadera = semiejes(contornos.cadera / 100, femenino ? 0.76 : 0.7);
  const hombros = altura * (femenino ? 0.118 : 0.132) * forma.hombros * (0.94 + (indice - 22) * 0.008);

  return {
    altura,
    femenino,
    hombros: Math.max(hombros, pecho.ancho * 1.12),
    pecho,
    cintura,
    cadera,
    musculo: forma.musculo,
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
  const guardado = String(datos?.tipoCuerpo ?? '');
  const tipo = TIPOS_CUERPO.some((t) => t.id === guardado)
    ? (guardado as TipoCuerpo)
    : (TIPOS_ANTERIORES[guardado] ?? base.tipoCuerpo);
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
