export interface Prenda {
  id: string;
  nombre: string;
  categoria: string;
  precio: string;
  imagen: string;
}

export interface TiendaCatalogo {
  id: string;
  nombre: string;
  monograma: string;
  prendas: Prenda[];
}

const IMAGENES = {
  chaqueta:
    'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=600&q=80',
  vestido:
    'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=600&q=80',
  camisa:
    'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=600&q=80',
  pantalon:
    'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=600&q=80',
  blazer:
    'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=600&q=80',
  punto:
    'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=600&q=80'
};

export const CATALOGOS: TiendaCatalogo[] = [
  {
    id: 'shein',
    nombre: 'Shein',
    monograma: 'SH',
    prendas: [
      { id: 'shein-1', nombre: 'Blazer Oversize', categoria: 'Sastrería', precio: '$49.900', imagen: IMAGENES.blazer },
      { id: 'shein-2', nombre: 'Vestido Midi Plisado', categoria: 'Vestidos', precio: '$39.900', imagen: IMAGENES.vestido },
      { id: 'shein-3', nombre: 'Camisa de Lino', categoria: 'Camisas', precio: '$29.900', imagen: IMAGENES.camisa },
      { id: 'shein-4', nombre: 'Pantalón Wide Leg', categoria: 'Pantalones', precio: '$35.900', imagen: IMAGENES.pantalon }
    ]
  },
  {
    id: 'palacio',
    nombre: 'El Palacio de Hierro',
    monograma: 'PH',
    prendas: [
      { id: 'palacio-1', nombre: 'Chaqueta Sastre', categoria: 'Abrigos', precio: '$189.000', imagen: IMAGENES.chaqueta },
      { id: 'palacio-2', nombre: 'Vestido de Gala', categoria: 'Vestidos', precio: '$229.000', imagen: IMAGENES.vestido },
      { id: 'palacio-3', nombre: 'Blusa de Seda', categoria: 'Blusas', precio: '$99.000', imagen: IMAGENES.camisa },
      { id: 'palacio-4', nombre: 'Pantalón Recto', categoria: 'Pantalones', precio: '$119.000', imagen: IMAGENES.pantalon }
    ]
  },
  {
    id: 'adidas',
    nombre: 'Adidas',
    monograma: 'AD',
    prendas: [
      { id: 'adidas-1', nombre: 'Chaqueta Track Top', categoria: 'Deportivo', precio: '$89.900', imagen: IMAGENES.chaqueta },
      { id: 'adidas-2', nombre: 'Camiseta Essentials', categoria: 'Camisetas', precio: '$34.900', imagen: IMAGENES.punto },
      { id: 'adidas-3', nombre: 'Pantalón Adicolor', categoria: 'Pantalones', precio: '$69.900', imagen: IMAGENES.pantalon },
      { id: 'adidas-4', nombre: 'Sudadera Crew', categoria: 'Sudaderas', precio: '$79.900', imagen: IMAGENES.punto }
    ]
  },
  {
    id: 'studio-f',
    nombre: 'Studio F',
    monograma: 'SF',
    prendas: [
      { id: 'studio-f-1', nombre: 'Blazer Entallado', categoria: 'Sastrería', precio: '$159.900', imagen: IMAGENES.blazer },
      { id: 'studio-f-2', nombre: 'Vestido Bodycon', categoria: 'Vestidos', precio: '$129.900', imagen: IMAGENES.vestido },
      { id: 'studio-f-3', nombre: 'Camisa Oversize', categoria: 'Camisas', precio: '$89.900', imagen: IMAGENES.camisa },
      { id: 'studio-f-4', nombre: 'Pantalón Palazzo', categoria: 'Pantalones', precio: '$109.900', imagen: IMAGENES.pantalon }
    ]
  },
  {
    id: 'amazon',
    nombre: 'Amazon',
    monograma: 'AM',
    prendas: [
      { id: 'amazon-1', nombre: 'Chaqueta Acolchada', categoria: 'Abrigos', precio: '$74.900', imagen: IMAGENES.chaqueta },
      { id: 'amazon-2', nombre: 'Vestido Casual', categoria: 'Vestidos', precio: '$45.900', imagen: IMAGENES.vestido },
      { id: 'amazon-3', nombre: 'Camisa Oxford', categoria: 'Camisas', precio: '$39.900', imagen: IMAGENES.camisa },
      { id: 'amazon-4', nombre: 'Jogger Urbano', categoria: 'Pantalones', precio: '$42.900', imagen: IMAGENES.pantalon }
    ]
  },
  {
    id: 'zara',
    nombre: 'Zara',
    monograma: 'ZA',
    prendas: [
      { id: 'zara-1', nombre: 'Blazer Estructurado', categoria: 'Sastrería', precio: '$129.900', imagen: IMAGENES.blazer },
      { id: 'zara-2', nombre: 'Vestido Satín', categoria: 'Vestidos', precio: '$89.900', imagen: IMAGENES.vestido },
      { id: 'zara-3', nombre: 'Camisa Popelín', categoria: 'Camisas', precio: '$59.900', imagen: IMAGENES.camisa },
      { id: 'zara-4', nombre: 'Pantalón Sastre', categoria: 'Pantalones', precio: '$79.900', imagen: IMAGENES.pantalon }
    ]
  },
  {
    id: 'hm',
    nombre: 'H&M',
    monograma: 'H&M',
    prendas: [
      { id: 'hm-1', nombre: 'Trench Coat', categoria: 'Abrigos', precio: '$119.900', imagen: IMAGENES.chaqueta },
      { id: 'hm-2', nombre: 'Vestido Fluido', categoria: 'Vestidos', precio: '$69.900', imagen: IMAGENES.vestido },
      { id: 'hm-3', nombre: 'Camisa de Viscosa', categoria: 'Camisas', precio: '$49.900', imagen: IMAGENES.camisa },
      { id: 'hm-4', nombre: 'Pantalón Cargo', categoria: 'Pantalones', precio: '$59.900', imagen: IMAGENES.pantalon }
    ]
  },
  {
    id: 'cya',
    nombre: 'C&A Moda',
    monograma: 'C&A',
    prendas: [
      { id: 'cya-1', nombre: 'Chaqueta Vaquera', categoria: 'Denim', precio: '$79.900', imagen: IMAGENES.chaqueta },
      { id: 'cya-2', nombre: 'Vestido Camisero', categoria: 'Vestidos', precio: '$65.900', imagen: IMAGENES.vestido },
      { id: 'cya-3', nombre: 'Camisa Denim', categoria: 'Camisas', precio: '$54.900', imagen: IMAGENES.camisa },
      { id: 'cya-4', nombre: 'Pantalón Chino', categoria: 'Pantalones', precio: '$62.900', imagen: IMAGENES.pantalon }
    ]
  },
  {
    id: 'aliexpress',
    nombre: 'AliExpress',
    monograma: 'AE',
    prendas: [
      { id: 'aliexpress-1', nombre: 'Chaqueta Bomber', categoria: 'Abrigos', precio: '$39.900', imagen: IMAGENES.chaqueta },
      { id: 'aliexpress-2', nombre: 'Vestido Ajustado', categoria: 'Vestidos', precio: '$29.900', imagen: IMAGENES.vestido },
      { id: 'aliexpress-3', nombre: 'Camisa Coreana', categoria: 'Camisas', precio: '$24.900', imagen: IMAGENES.camisa },
      { id: 'aliexpress-4', nombre: 'Pantalón Paracaídas', categoria: 'Pantalones', precio: '$34.900', imagen: IMAGENES.pantalon }
    ]
  },
  {
    id: 'bershka',
    nombre: 'Bershka',
    monograma: 'BE',
    prendas: [
      { id: 'bershka-1', nombre: 'Chaqueta Cropped', categoria: 'Abrigos', precio: '$69.900', imagen: IMAGENES.chaqueta },
      { id: 'bershka-2', nombre: 'Vestido Mini', categoria: 'Vestidos', precio: '$49.900', imagen: IMAGENES.vestido },
      { id: 'bershka-3', nombre: 'Camisa Oversize', categoria: 'Camisas', precio: '$39.900', imagen: IMAGENES.camisa },
      { id: 'bershka-4', nombre: 'Pantalón Baggy', categoria: 'Pantalones', precio: '$55.900', imagen: IMAGENES.pantalon }
    ]
  },
  {
    id: 'nike',
    nombre: 'Nike',
    monograma: 'NK',
    prendas: [
      { id: 'nike-1', nombre: 'Windrunner', categoria: 'Deportivo', precio: '$109.900', imagen: IMAGENES.chaqueta },
      { id: 'nike-2', nombre: 'Top Dri-FIT', categoria: 'Deportivo', precio: '$39.900', imagen: IMAGENES.punto },
      { id: 'nike-3', nombre: 'Camiseta Sportswear', categoria: 'Camisetas', precio: '$44.900', imagen: IMAGENES.punto },
      { id: 'nike-4', nombre: 'Pantalón Club', categoria: 'Pantalones', precio: '$64.900', imagen: IMAGENES.pantalon }
    ]
  }
];

export const TIENDA_CATALOGO_INICIAL = CATALOGOS.find((tienda) => tienda.id === 'zara') ?? CATALOGOS[0];
