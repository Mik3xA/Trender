const scraper = require('../src/servicios/scraper.service');

const ldProducto = (extra) =>
  `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', ...extra })}</script>`;

describe('scraper.service: adaptadores por tienda', () => {
  it('Amazon: galería en alta resolución, título, migas y precio', () => {
    const html = `<html><head><meta property="og:image" content="https://m.media-amazon.com/images/I/og.jpg"></head><body>
      <div id="wayfinding-breadcrumbs_feature_div"><a>Ropa</a><a>Hombre</a><a>Pantalones</a></div>
      <span id="productTitle"> Pantalón jogger de algodón </span>
      <span class="a-price"><span class="a-offscreen">$499.00</span></span>
      <img id="landingImage" data-old-hires="https://m.media-amazon.com/images/I/old.jpg"
           data-a-dynamic-image='{"https://m.media-amazon.com/images/I/chica.jpg":[300,300],"https://m.media-amazon.com/images/I/grande.jpg":[1500,1500]}'>
      <img src="https://m.media-amazon.com/images/G/logo-sprite.png">
      <script>var data = {"colorImages":{"initial":[{"hiRes":"https://m.media-amazon.com/images/I/hires1.jpg"},{"hiRes":"https://m.media-amazon.com/images/I/hires2.jpg"}]}}</script>
      </body></html>`;
    const r = scraper.analizarHtml(html, 'https://www.amazon.com.mx/dp/B0TEST');
    expect(r).toMatchObject({ tienda: 'amazon', titulo: 'Pantalón jogger de algodón', precio: '$499.00' });
    expect(r.categoriaTienda).toContain('Pantalones');
    expect(r.imagenes.map((i) => i.url).slice(0, 3)).toEqual([
      'https://m.media-amazon.com/images/I/hires1.jpg',
      'https://m.media-amazon.com/images/I/hires2.jpg',
      'https://m.media-amazon.com/images/I/grande.jpg',
    ]);
    expect(r.imagenes.some((i) => i.url.includes('sprite'))).toBe(false);
  });

  it('Mercado Libre: galería con versión grande (-F) y migas', () => {
    const html = `<h1 class="ui-pdp-title">Tenis Running Hombre</h1>
      <a class="andes-breadcrumb__link">Calzado</a><a class="andes-breadcrumb__link">Tenis</a>
      <figure class="ui-pdp-gallery__figure"><img data-zoom="https://http2.mlstatic.com/D_NQ_NP_123-O.webp" src="https://http2.mlstatic.com/D_NQ_NP_123-I.webp"></figure>`;
    const r = scraper.analizarHtml(html, 'https://articulo.mercadolibre.com.mx/MLM-1234-tenis-running');
    expect(r.tienda).toBe('mercadolibre');
    expect(r.titulo).toBe('Tenis Running Hombre');
    expect(r.categoriaTienda).toContain('Tenis');
    expect(r.imagenes[0].url).toBe('https://http2.mlstatic.com/D_NQ_NP_123-F.webp');
  });

  it('Nike: imágenes de __NEXT_DATA__ y JSON-LD', () => {
    const html = `<h1 id="pdp_product_title">Nike Air Force 1</h1>
      <script id="__NEXT_DATA__" type="application/json">{"props":{"imgs":[{"portraitURL":"https://static.nike.com/a/images/t_PDP/af1-1.png"}]}}</script>
      ${ldProducto({ name: 'Nike Air Force 1', image: ['https://static.nike.com/a/images/af1-ld.png'], category: 'Calzado' })}`;
    const r = scraper.analizarHtml(html, 'https://www.nike.com/mx/t/air-force-1-zapatillas');
    expect(r.titulo).toBe('Nike Air Force 1');
    expect(r.imagenes.map((i) => i.url)).toEqual(['https://static.nike.com/a/images/t_PDP/af1-1.png', 'https://static.nike.com/a/images/af1-ld.png']);
  });

  it('Zara y H&M: galería con srcset y tamaño grande', () => {
    const zara = scraper.analizarHtml(
      `<picture class="media-image__image"><img srcset="https://static.zara.net/p/1.jpg?w=200 200w, https://static.zara.net/p/1.jpg?w=750 750w"></picture>`,
      'https://www.zara.com/mx/es/camisa-lino-p01234.html'
    );
    expect(zara.imagenes[0].url).toBe('https://static.zara.net/p/1.jpg?w=1024');
    const hm = scraper.analizarHtml(
      `<h1>Sudadera con capucha</h1><figure class="pdp-image"><img data-zoom-src="//image.hm.com/assets/hm/sud.jpg"></figure>`,
      'https://www2.hm.com/es_mx/productpage.1234567001.html'
    );
    expect(hm).toMatchObject({ tienda: 'hm', titulo: 'Sudadera con capucha' });
    expect(hm.imagenes[0].url).toBe('https://image.hm.com/assets/hm/sud.jpg');
  });

  it('tienda genérica: og:image + JSON-LD + galería, sin banners, logos ni duplicados', () => {
    const html = `<meta property="og:image" content="https://cdn.tienda.example/p/foto.jpg?v=1">
      ${ldProducto({ name: 'Falda midi', image: 'https://cdn.tienda.example/p/foto.jpg?v=2' })}
      <div class="product-gallery"><img src="/p/foto-2.jpg"><img src="/img/banner-promo.jpg"><img src="/img/logo.svg"></div>`;
    const r = scraper.analizarHtml(html, 'https://tienda.example/falda');
    expect(r.imagenes.map((i) => i.url)).toEqual(['https://cdn.tienda.example/p/foto.jpg?v=2', 'https://tienda.example/p/foto-2.jpg']);
  });

  it('descarta imágenes que apuntan a la red interna', () => {
    expect(scraper.limpiarImagen('http://192.168.0.2/a.jpg', 'https://x.example')).toBeNull();
    expect(scraper.limpiarImagen('http://localhost/a.jpg', 'https://x.example')).toBeNull();
  });

  it('detecta páginas de bloqueo (captcha, Cloudflare) pero no páginas de producto', () => {
    expect(scraper.detectarBloqueo('<title>Robot Check</title> Enter the characters you see below')).toBe(true);
    expect(scraper.detectarBloqueo('<div id="cf-chl-widget">Checking your browser</div>')).toBe(true);
    expect(scraper.detectarBloqueo(ldProducto({ name: 'x' }) + 'captcha en el pie')).toBe(false);
  });

  it('cuando no lee páginas, devuelve solo la tienda', async () => {
    await expect(scraper.extraerProducto('https://www.zara.com/mx/es/x.html', { leerPagina: false })).resolves.toMatchObject({
      tienda: 'zara',
      imagenes: [],
      metodo: 'url',
    });
  });

  it('si la tienda bloquea y no hay navegador, avisa en vez de fallar', async () => {
    const pagina = require('../src/servicios/pagina.service');
    const espia = jest.spyOn(pagina, 'obtenerHtml').mockResolvedValue({ html: '<title>Robot Check</title> captcha', estado: 200 });
    const r = await scraper.extraerProducto('https://www.amazon.com.mx/dp/B0X', { leerPagina: true, usarNavegador: false });
    espia.mockRestore();
    expect(r).toMatchObject({ tienda: 'amazon', bloqueado: true, imagenes: [] });
  });
});
