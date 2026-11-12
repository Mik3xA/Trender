
/**
 * Escáner de prendas.
 *
 * 1. Lee la página del producto (título, JSON-LD, migas de pan) si es posible.
 * 2. Clasifica con un diccionario ES/EN ponderado por fuente: la categoría de
 *    la tienda y el título pesan más que las palabras de la URL.
 * 3. Si no hay evidencia suficiente NO adivina: devuelve categoria = null y
 *    el frontend pide al usuario que elija.
 */

// Categorías que el probador sabe vestir y su equivalente en el armario.
const CATEGORIAS = {
  Torso: { closet: 'top', nombre: 'Prenda superior' },
  Piernas: { closet: 'bottom', nombre: 'Pantalón / Falda' },
  Calzado: { closet: 'shoes', nombre: 'Calzado' },
  Vestido: { closet: 'top', nombre: 'Vestido' },
};

/**
 * Tipos de prenda: palabras (ya normalizadas, sin acentos) que los delatan.
 * Se admite plural (-s / -es). Los compuestos van explícitos ("sweatpants")
 * para no confundir subcadenas ("pants" dentro de "participants").
 * Las palabras con "~" son débiles (valen la mitad y no cuentan como la
 * prenda principal del título): "polo" también es marca, "short" aparece en
 * "short sleeve shirt", "top" en "top ventas", etc.
 */
const TIPOS = [
  // Piernas
  { tipo: 'jeans', categoria: 'Piernas', palabras: ['jean', 'jeans', 'bootcut', '~vaquero', '~mezclilla', '~skinny'] },
  { tipo: 'jogger', categoria: 'Piernas', palabras: ['jogger', 'sweatpants', 'trackpants', 'joggerpants', 'pants deportivo'] },
  { tipo: 'short', categoria: 'Piernas', palabras: ['shorts', 'bermuda', '~short'] },
  { tipo: 'falda', categoria: 'Piernas', palabras: ['falda', 'skirt', 'minifalda', 'midi skirt'] },
  { tipo: 'leggings', categoria: 'Piernas', palabras: ['legging', 'leggings', '~malla', '~licra'] },
  {
    tipo: 'pantalon',
    categoria: 'Piernas',
    palabras: ['pantalon', 'pants', 'trouser', 'cargopants', 'palazzo', 'culotte', 'slacks', '~chino', '~cargo'],
  },
  // Calzado
  { tipo: 'tenis', categoria: 'Calzado', palabras: ['tenis', 'sneaker', 'zapatilla', 'trainer', '~deportivas'] },
  { tipo: 'botas', categoria: 'Calzado', palabras: ['bota', 'botin', 'boot', 'botines', '~chelsea'] },
  { tipo: 'sandalias', categoria: 'Calzado', palabras: ['sandalia', 'sandal', 'chancla', 'huarache', 'flip flop'] },
  { tipo: 'zapatos', categoria: 'Calzado', palabras: ['zapato', 'shoe', 'calzado', 'mocasin', 'loafer', 'tacon', 'heels', 'footwear', '~oxford'] },
  // Vestidos
  { tipo: 'vestido', categoria: 'Vestido', palabras: ['vestido', 'dress', 'minidress', 'maxidress', 'sundress', 'jumpsuit', 'enterizo'] },
  // Torso
  { tipo: 'sudadera', categoria: 'Torso', palabras: ['sudadera', 'hoodie', 'sweatshirt', 'crewneck', 'buzo'] },
  { tipo: 'chamarra', categoria: 'Torso', palabras: ['chamarra', 'chaqueta', 'jacket', 'bomber', 'parka', 'puffer', 'cazadora', 'rompevientos', 'windbreaker'] },
  { tipo: 'abrigo', categoria: 'Torso', palabras: ['abrigo', 'coat', 'gabardina', 'trench', 'overcoat'] },
  { tipo: 'blazer', categoria: 'Torso', palabras: ['blazer', '~saco', '~americana'] },
  { tipo: 'sueter', categoria: 'Torso', palabras: ['sueter', 'sweater', 'jersey', 'cardigan', 'pullover', '~knit'] },
  { tipo: 'camisa', categoria: 'Torso', palabras: ['camisa', 'shirt', 'overshirt', 'button down'] },
  { tipo: 'blusa', categoria: 'Torso', palabras: ['blusa', 'blouse'] },
  { tipo: 'top', categoria: 'Torso', palabras: ['crop top', 'bralette', 'corset', 'bodysuit', 'tank top', '~top', '~tank'] },
  {
    tipo: 'camiseta',
    categoria: 'Torso',
    palabras: ['camiseta', 'playera', 'tshirt', 't shirt', 'tee', 'remera', 'musculosa', 'chaleco', '~polo', '~vest'],
  },
];

// Productos que no son ropa que se pueda vestir en el avatar.
const ACCESORIOS = [
  'cinturon', 'belt', 'bolso', 'bolsa', 'bag', 'mochila', 'backpack', 'cartera', 'wallet', 'gorra', 'cap',
  'sombrero', 'hat', 'gafas', 'lentes', 'sunglasses', 'reloj', 'watch', 'bufanda', 'scarf', 'calcetin',
  'calceta', 'sock', 'collar', 'necklace', 'arete', 'earring', 'pulsera', 'bracelet', 'perfume', 'anillo', 'ring',
];

// Tipos genéricos que ceden ante uno más concreto de su misma categoría.
const GENERICOS = new Set(['pantalon', 'zapatos', 'camiseta']);

// Peso de cada fuente de texto.
const PESOS = { categoria: 4, titulo: 3, url: 2, descripcion: 1 };

const COLORES = [
  { nombre: 'negro', hex: '#1d1d1f', palabras: ['negro', 'negra', 'black', 'onyx'] },
  { nombre: 'blanco', hex: '#efede6', palabras: ['blanco', 'blanca', 'white', 'ivory', 'marfil', 'hueso', 'off white'] },
  { nombre: 'gris', hex: '#8b8b88', palabras: ['gris', 'gray', 'grey', 'jaspeado', 'heather', 'charcoal', 'carbon'] },
  { nombre: 'azul marino', hex: '#1f2a44', palabras: ['marino', 'navy'] },
  { nombre: 'azul', hex: '#2f4f86', palabras: ['azul', 'blue', 'indigo', 'cobalto'] },
  { nombre: 'celeste', hex: '#8fb5d6', palabras: ['celeste', 'sky', 'light blue', 'azul claro'] },
  { nombre: 'rojo', hex: '#a32f2b', palabras: ['rojo', 'roja', 'red', 'escarlata'] },
  { nombre: 'vino', hex: '#5c1f2c', palabras: ['vino', 'guinda', 'burgundy', 'bordo', 'maroon'] },
  { nombre: 'rosa', hex: '#d8a1aa', palabras: ['rosa', 'pink', 'rosado', 'fucsia'] },
  { nombre: 'verde', hex: '#3e6a48', palabras: ['verde', 'green', 'esmeralda'] },
  { nombre: 'oliva', hex: '#5b6236', palabras: ['oliva', 'olive', 'militar', 'khaki', 'caqui'] },
  { nombre: 'beige', hex: '#d6c6a5', palabras: ['beige', 'arena', 'sand', 'crema', 'cream', 'nude', 'ecru'] },
  { nombre: 'café', hex: '#6a4a33', palabras: ['cafe', 'marron', 'brown', 'chocolate', 'tabaco'] },
  { nombre: 'camel', hex: '#b0834f', palabras: ['camel', 'cognac', 'mostaza'] },
  { nombre: 'amarillo', hex: '#d6b23c', palabras: ['amarillo', 'yellow'] },
  { nombre: 'naranja', hex: '#d2763a', palabras: ['naranja', 'orange', 'terracota'] },
  { nombre: 'morado', hex: '#5f4a78', palabras: ['morado', 'purple', 'lila', 'lavanda', 'violeta'] },
];

/** Minúsculas y sin acentos: "Pantalón" -> "pantalon". */
function normalizarTexto(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Lista de palabras (letras y números) del texto normalizado. */
function palabras(texto) {
  return normalizarTexto(texto).split(/[^a-z0-9]+/).filter(Boolean);
}

/** Palabras de la ruta y la consulta de una URL (el dominio no cuenta). */
function palabrasDeUrl(url) {
  try {
    const u = new URL(url);
    let ruta = `${u.pathname} ${u.search}`;
    try {
      ruta = decodeURIComponent(ruta);
    } catch {
      /* secuencia % inválida: se usa tal cual */
    }
    // "Men-Sweatpants" y "camisaHombre": separa también camelCase.
    return palabras(ruta.replace(/([a-z])([A-Z])/g, '$1 $2'));
  } catch {
    return palabras(url);
  }
}

/**
 * Posición de la primera aparición de `termino` (una o varias palabras) en la
 * lista, admitiendo plural en la última palabra; -1 si no aparece.
 */
function buscarTermino(lista, termino) {
  const partes = termino.split(' ');
  const ultima = partes.length - 1;
  for (let i = 0; i + ultima < lista.length; i += 1) {
    const coincide = partes.every((parte, j) => {
      const palabra = lista[i + j];
      if (j < ultima) return palabra === parte;
      return palabra === parte || palabra === `${parte}s` || palabra === `${parte}es`;
    });
    if (coincide) return i;
  }
  return -1;
}

/**
 * Puntúa cada tipo de prenda a partir de varias fuentes de texto.
 * @param {{ categoria?: string, titulo?: string, url?: string, descripcion?: string }} fuentes
 */
function clasificar(fuentes) {
  const textos = {
    categoria: palabras(fuentes.categoria),
    titulo: palabras(fuentes.titulo),
    url: fuentes.url ? palabrasDeUrl(fuentes.url) : [],
    descripcion: palabras(fuentes.descripcion).slice(0, 60),
  };

  const puntos = new Map();
  const fuentesPorTipo = new Map();
  let primeroEnTitulo = { tipo: null, posicion: Infinity };

  for (const def of TIPOS) {
    let total = 0;
    for (const [fuente, lista] of Object.entries(textos)) {
      let factor = 0;
      for (const entrada of def.palabras) {
        const debil = entrada.startsWith('~');
        const posicion = buscarTermino(lista, debil ? entrada.slice(1) : entrada);
        if (posicion < 0) continue;
        // Una frase de varias palabras ("t shirt") es más específica que una palabra suelta ("shirt").
        const especificidad = 1 + 0.25 * (entrada.split(' ').length - 1);
        factor = Math.max(factor, debil ? 0.5 : especificidad);
        if (!debil && fuente === 'titulo' && posicion < primeroEnTitulo.posicion) {
          primeroEnTitulo = { tipo: def.tipo, posicion };
        }
      }
      total += PESOS[fuente] * factor;
      if (factor > 0) fuentesPorTipo.set(def.tipo, [...(fuentesPorTipo.get(def.tipo) ?? []), fuente]);
    }
    if (total > 0) puntos.set(def.tipo, total);
  }
  // En un título como "Pantalón cargo para combinar con camisa" la prenda es la primera nombrada.
  if (primeroEnTitulo.tipo) puntos.set(primeroEnTitulo.tipo, puntos.get(primeroEnTitulo.tipo) + 2);

  const textoPrincipal = [...textos.categoria, ...textos.titulo, ...textos.url];
  const accesorio = ACCESORIOS.find((a) => buscarTermino(textoPrincipal, a) >= 0);

  const ranking = [...puntos.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranking.length) {
    return { tipo: null, categoria: null, confianza: 'ninguna', accesorio: accesorio ?? null, fuentes: [] };
  }

  let [[tipo, mejor], segundo] = ranking;
  let def = TIPOS.find((t) => t.tipo === tipo);
  // "Pantalón jogger": dentro de la misma categoría gana el tipo más específico nombrado en el título.
  if (GENERICOS.has(tipo)) {
    const especifico = ranking.find(
      ([otro, valor]) => otro !== tipo && valor >= PESOS.titulo && TIPOS.find((t) => t.tipo === otro).categoria === def.categoria
    );
    if (especifico) {
      [tipo] = especifico;
      def = TIPOS.find((t) => t.tipo === tipo);
      segundo = ranking.find(([otro]) => otro !== tipo && TIPOS.find((t) => t.tipo === otro).categoria !== def.categoria);
    }
  }
  // Si el accesorio domina el inicio del título ("Cinturón para pantalón") no es una prenda.
  const posAccesorio = accesorio ? buscarTermino(textos.titulo, accesorio) : -1;
  if (accesorio && (posAccesorio >= 0 ? posAccesorio < primeroEnTitulo.posicion : mejor < PESOS.titulo)) {
    return { tipo: null, categoria: null, confianza: 'ninguna', accesorio, fuentes: [] };
  }

  const margen = mejor - (segundo?.[1] ?? 0);
  const confianza = mejor >= 5 && margen >= 2 ? 'alta' : mejor >= 2 && margen >= 1 ? 'media' : 'baja';
  return { tipo, categoria: def.categoria, confianza, accesorio: null, fuentes: fuentesPorTipo.get(tipo) ?? [] };
}

function detectarColor(...textos) {
  for (const texto of textos) {
    const lista = palabras(texto);
    const color = COLORES.find((c) => c.palabras.some((p) => buscarTermino(lista, p) >= 0));
    if (color) return { nombre: color.nombre, hex: color.hex };
  }
  return null;
}

function formatearPrecio(precio, moneda) {
  const numero = Number(String(precio ?? '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(numero) || numero <= 0) return null;
  const cifra = numero.toLocaleString('es-MX', { minimumFractionDigits: numero % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `$${cifra}${moneda ? ` ${String(moneda).toUpperCase()}` : ''}`;
}

const SEGMENTOS_GENERICOS = new Set(['productpage', 'product', 'producto', 'products', 'item', 'p', 'dp', 'html', 'es', 'mx', 'en', 'us']);

/** "pantalon-recto-negro-p01234.html" -> "Pantalon recto negro" (nombre si la página no se pudo leer). */
function nombreDesdeUrl(url) {
  const tramos = new URL(url).pathname.split('/').filter(Boolean);
  const candidatos = tramos.map((tramo) =>
    tramo
      .replace(/\.(html?|php|aspx?)$/i, '')
      .split(/[-_.+]+/)
      // Fuera códigos de producto ("p01", "1234567001", "sku88") y segmentos genéricos.
      .filter((w) => w.length > 1 && !/\d{3,}|^[a-z]{0,3}\d+$/i.test(w) && !SEGMENTOS_GENERICOS.has(w.toLowerCase()))
  );
  const mejor = candidatos.sort((a, b) => b.length - a.length)[0] ?? [];
  if (mejor.length < 2) return null;
  const texto = mejor.join(' ').toLowerCase().slice(0, 80);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

module.exports = {
  nombreDesdeUrl,
  clasificar,
  detectarColor,
  formatearPrecio,
  normalizarTexto,
  palabrasDeUrl,
  CATEGORIAS,
  COLORES,
};
