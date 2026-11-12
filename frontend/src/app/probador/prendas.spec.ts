import { categoriaDeTipo, partesDe } from './prendas';

describe('prendas', () => {
  it('cada tipo pertenece a una categoría', () => {
    expect(categoriaDeTipo('jogger')).toBe('bottom');
    expect(categoriaDeTipo('sudadera')).toBe('top');
    expect(categoriaDeTipo('outfit')).toBe('outfit');
    expect(categoriaDeTipo('nave')).toBeNull();
  });

  it('partes del cuerpo: un vestido cubre arriba y abajo; un outfit, lo elegido', () => {
    expect(partesDe('dress')).toEqual(['top', 'bottom']);
    expect(partesDe('outfit')).toEqual(['top', 'bottom', 'shoes']);
    expect(partesDe('outfit', ['shoes'])).toEqual(['shoes']);
    expect(partesDe(null)).toEqual([]);
  });
});
