import { MEDIDAS_INICIALES, Medidas } from './cuerpo';
import { recomendarTalla } from './tallas';

const hombre = (pecho: number, cintura: number): Medidas => ({ ...MEDIDAS_INICIALES.Masculino, pecho, cintura, cadera: 98 });
const mujer = (pecho: number, cadera: number): Medidas => ({ ...MEDIDAS_INICIALES.Femenino, pecho, cintura: 68, cadera });

describe('recomendarTalla', () => {
  it.each([
    [86, 'XS'],
    [92, 'S'],
    [100, 'M'],
    [108, 'L'],
    [116, 'XL'],
    [126, 'XXL'],
  ])('hombre, pecho %i -> %s', (pecho, talla) => {
    expect(recomendarTalla(hombre(pecho, 80), 'Torso').talla).toBe(talla);
  });

  it('usa la cintura del hombre y la cadera de la mujer para prendas inferiores', () => {
    expect(recomendarTalla(hombre(100, 90), 'Piernas')).toMatchObject({ talla: 'L', base: 'cintura 90 cm' });
    expect(recomendarTalla(mujer(88, 96), 'Piernas')).toMatchObject({ talla: 'M', base: 'cadera 96 cm' });
  });

  it('avisa cuando la medida está entre dos tallas', () => {
    expect(recomendarTalla(hombre(95, 80), 'Torso').nota).toContain('Entre S y M');
  });

  it('en vestidos manda la mayor talla entre busto y cadera', () => {
    expect(recomendarTalla(mujer(84, 108), 'Vestido').talla).toBe('XL');
  });

  it('marca las medidas estimadas y da una talla aproximada de calzado', () => {
    expect(recomendarTalla(MEDIDAS_INICIALES.Femenino, 'Torso').base).toContain('(estimada)');
    expect(recomendarTalla({ ...MEDIDAS_INICIALES.Masculino, altura: 176 }, 'Calzado').talla).toBe('MX 27');
  });
});
