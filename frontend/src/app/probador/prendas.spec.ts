import { MUESTRAS, PrendaEscaneada, estiloDe, prendaDesdeEscaneo, vestirConjunto } from './prendas';

const muestra = (id: string) => MUESTRAS.find((m) => m.id === id)!;
const escaneo = (extra: Partial<PrendaEscaneada>): PrendaEscaneada => ({
  id: 'scanned_1',
  nombre: 'Pantalón jogger',
  categoria: 'Piernas',
  tipo: 'jogger',
  confianza: 'alta',
  color: { nombre: 'negro', hex: '#1d1d1f' },
  precio: '$599 MXN',
  marca: null,
  imagen: null,
  tienda: 'tienda.example',
  fuente: 'pagina',
  motivo: null,
  ...extra,
});

describe('prendas', () => {
  it('una prenda reemplaza a la que ocupa su misma ranura', () => {
    let conjunto = vestirConjunto([], muestra('m-camiseta'));
    conjunto = vestirConjunto(conjunto, muestra('m-jeans'));
    conjunto = vestirConjunto(conjunto, muestra('m-sudadera'));
    expect(conjunto.map((p) => p.id)).toEqual(['m-jeans', 'm-sudadera']);
  });

  it('un vestido sustituye a la prenda superior y a la inferior, no al calzado', () => {
    const conjunto = [muestra('m-camiseta'), muestra('m-jeans'), muestra('m-tenis')].reduce(vestirConjunto, []);
    expect(vestirConjunto(conjunto, muestra('m-vestido')).map((p) => p.id)).toEqual(['m-tenis', 'm-vestido']);
  });

  it('convierte el escaneo en una prenda vestible con su color y tipo', () => {
    expect(prendaDesdeEscaneo(escaneo({}))).toMatchObject({ categoria: 'Piernas', tipo: 'jogger', color: '#1d1d1f' });
  });

  it('sin categoría no se viste hasta que el usuario elige; su elección manda', () => {
    const desconocida = escaneo({ categoria: null, tipo: null, color: null });
    expect(prendaDesdeEscaneo(desconocida)).toBeNull();
    expect(prendaDesdeEscaneo(desconocida, 'Calzado')).toMatchObject({ categoria: 'Calzado', tipo: 'tenis' });
    // Si el usuario corrige la categoría no se conserva un tipo de otra categoría.
    expect(prendaDesdeEscaneo(escaneo({}), 'Torso')).toMatchObject({ categoria: 'Torso', tipo: 'camiseta' });
  });

  it('tiene estilo 3D para todos los tipos que devuelve el escáner', () => {
    for (const tipo of ['jeans', 'jogger', 'short', 'falda', 'leggings', 'pantalon', 'tenis', 'botas', 'sandalias', 'zapatos',
      'vestido', 'sudadera', 'chamarra', 'abrigo', 'blazer', 'sueter', 'camisa', 'blusa', 'top', 'camiseta']) {
      expect(estiloDe({ tipo, categoria: 'Torso' })).toBeDefined();
    }
  });

  it('el cuestionario cambia el estilo 3D: holgura, largo, manga, capucha', () => {
    const base = estiloDe({ tipo: 'sueter', categoria: 'Torso' });
    const holgado = estiloDe({ tipo: 'sueter', categoria: 'Torso', ajustes: { ajuste: 'holgado', largo: 'largo', manga: 'corta', capucha: true } });
    expect(holgado.holgura).toBeGreaterThan(base.holgura);
    expect(holgado.largo).toBeLessThan(base.largo); // bajo más abajo
    expect(holgado.manga).toBeCloseTo(0.32);
    expect(holgado.capucha).toBe(true);
    const ajustado = estiloDe({ tipo: 'jeans', categoria: 'Piernas', ajustes: { ajuste: 'ajustado', largo: 'corto' } });
    expect(ajustado.holgura).toBeLessThan(estiloDe({ tipo: 'jeans', categoria: 'Piernas' }).holgura);
    expect(ajustado.largo).toBeGreaterThan(0.1);
  });
});
