import { MEDIDAS_INICIALES, calcularProporciones, estimarContornos, imc, interpolarMedidas, sanearMedidas, semiejes } from './cuerpo';

describe('cuerpo', () => {
  it('estima contornos plausibles para cuerpos de referencia', () => {
    const mujer = estimarContornos(MEDIDAS_INICIALES.Femenino);
    const hombre = estimarContornos(MEDIDAS_INICIALES.Masculino);
    expect(mujer.pecho).toBeGreaterThan(84);
    expect(mujer.pecho).toBeLessThan(96);
    expect(mujer.cintura).toBeLessThan(mujer.cadera - 20);
    expect(hombre.pecho).toBeGreaterThan(92);
    expect(hombre.pecho).toBeLessThan(104);
    expect(mujer.estimados).toBe(true);
  });

  it('el peso y el tipo de cuerpo cambian los contornos', () => {
    const base = MEDIDAS_INICIALES.Masculino;
    expect(estimarContornos({ ...base, peso: 95 }).cintura).toBeGreaterThan(estimarContornos(base).cintura + 8);
    expect(estimarContornos({ ...base, tipoCuerpo: 'sobrepeso' }).cintura).toBeGreaterThan(estimarContornos(base).cintura + 8);
    expect(estimarContornos({ ...base, tipoCuerpo: 'delgado' }).pecho).toBeLessThan(estimarContornos(base).pecho);
    const fit = calcularProporciones({ ...base, tipoCuerpo: 'fit' });
    const normal = calcularProporciones(base);
    expect(fit.hombros).toBeGreaterThan(normal.hombros);
    expect(fit.cintura.ancho).toBeLessThan(normal.cintura.ancho);
    expect(fit.musculo).toBeGreaterThan(normal.musculo);
  });

  it('respeta las medidas exactas del usuario', () => {
    const c = estimarContornos({ ...MEDIDAS_INICIALES.Femenino, pecho: 92, cintura: 70, cadera: 98 });
    expect(c).toEqual({ pecho: 92, cintura: 70, cadera: 98, estimados: false });
  });

  it('calcula semiejes que reproducen el perímetro (Ramanujan)', () => {
    const { ancho, fondo } = semiejes(1, 1);
    expect(ancho).toBeCloseTo(1 / (2 * Math.PI), 6);
    expect(fondo).toBeCloseTo(ancho, 6);
  });

  it('las proporciones escalan con la altura y diferencian géneros', () => {
    const alta = calcularProporciones({ ...MEDIDAS_INICIALES.Masculino, altura: 195 });
    const baja = calcularProporciones({ ...MEDIDAS_INICIALES.Masculino, altura: 160 });
    expect(alta.y.hombro).toBeGreaterThan(baja.y.hombro);
    const h = calcularProporciones(MEDIDAS_INICIALES.Masculino);
    const m = calcularProporciones(MEDIDAS_INICIALES.Femenino);
    expect(h.hombros / h.cadera.ancho).toBeGreaterThan(m.hombros / m.cadera.ancho);
    expect(m.busto).toBeGreaterThan(h.busto);
  });

  it('sanea datos guardados: límites, tipos inválidos y nulos', () => {
    expect(sanearMedidas(null)).toEqual({ ...MEDIDAS_INICIALES.Femenino, pecho: null, cintura: null, cadera: null });
    const m = sanearMedidas({ genero: 'Masculino', altura: 400, peso: 10, tipoCuerpo: 'x' as never, pecho: 5 });
    expect(m).toMatchObject({ genero: 'Masculino', altura: 210, peso: 35, tipoCuerpo: 'normal', pecho: null });
    // Tipos del probador anterior.
    expect(sanearMedidas({ tipoCuerpo: 'ovalo' as never }).tipoCuerpo).toBe('sobrepeso');
    expect(sanearMedidas({ tipoCuerpo: 'triangulo-invertido' as never }).tipoCuerpo).toBe('fit');
  });

  it('interpola entre dos cuerpos', () => {
    const a = MEDIDAS_INICIALES.Femenino;
    const b = { ...a, altura: 183, peso: 78 };
    const mitad = interpolarMedidas(a, b, 0.5);
    expect(mitad.altura).toBeCloseTo(173);
    expect(imc(mitad)).toBeGreaterThan(imc(a));
  });
});
