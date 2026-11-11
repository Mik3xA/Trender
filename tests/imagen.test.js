const sharp = require('sharp');
const imagen = require('../src/servicios/imagen.service');
const { fotoCatalogo, fotoConModelo, banner } = require('./imagenes-prueba');

describe('imagen.service', () => {
  it('prefiere la foto de catálogo sobre la foto con modelo y sobre un banner', async () => {
    const catalogo = await imagen.evaluarImagen(await fotoCatalogo('camiseta'));
    const modelo = await imagen.evaluarImagen(await fotoConModelo());
    const anuncio = await imagen.evaluarImagen(await banner());
    expect(catalogo.uniformidadFondo).toBeGreaterThan(0.95);
    expect(modelo.fraccionPiel).toBeGreaterThan(0.2);
    expect(catalogo.puntaje).toBeGreaterThan(modelo.puntaje);
    expect(catalogo.puntaje).toBeGreaterThan(anuncio.puntaje);
  });

  it('quita el fondo blanco y recorta a la prenda con transparencia', async () => {
    const { png, metodo, ancho, alto } = await imagen.quitarFondo(await fotoCatalogo('camiseta'));
    expect(metodo).toBe('recorte-local');
    const meta = await sharp(png).metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(ancho).toBeLessThan(600); // recortado al contorno
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const alfa = (x, y) => data[(y * info.width + x) * 4 + 3];
    expect(alfa(2, 2)).toBeLessThan(30); // esquina: fondo transparente (entre las mangas y el cuello)
    expect(alfa(Math.floor(ancho / 2), Math.floor(alto / 2))).toBeGreaterThan(220); // centro: tela
  });

  it('se niega a recortar fotos sin fondo liso', async () => {
    await expect(imagen.quitarFondo(await fotoConModelo())).rejects.toMatchObject({ code: 'FONDO_NO_LISO' });
  });

  it.each([
    ['pantalon', 'Piernas'],
    ['tenis', 'Calzado'],
    ['camiseta', 'Torso'],
    ['vestido', 'Vestido'],
  ])('la silueta de %s vota por %s', async (forma, categoria) => {
    const { png } = await imagen.quitarFondo(await fotoCatalogo(forma, { fondo: '#f4f4f4' }));
    const { votos } = imagen.votarSilueta(await imagen.analizarSilueta(png));
    const ganador = Object.entries(votos).sort((a, b) => b[1] - a[1])[0];
    expect(ganador[0]).toBe(categoria);
    expect(ganador[1]).toBeGreaterThanOrEqual(2);
  });

  it('obtiene el color dominante de la prenda', async () => {
    const { png } = await imagen.quitarFondo(await fotoCatalogo('pantalon'));
    const hex = await imagen.colorDominante(png);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    expect(b).toBeGreaterThan(r + 40); // azul
    expect(g).toBeLessThan(b);
  });
});
