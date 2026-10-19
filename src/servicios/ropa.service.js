const BRAND_GARMENTS = {
  zara: [
    { nombre: 'Blazer Estructurado', precio: '$2,590', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Pantalón Ancho', precio: '$1,290', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Camisa Lino', precio: '$999', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Jeans Rectos', precio: '$1,199', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Abrigo Lana', precio: '$3,490', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=500&auto=format&fit=crop&q=60' }
  ],
  shein: [
    { nombre: 'Blusa Satinada', precio: '$399', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Falda Plisada', precio: '$459', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Vestido Midi', precio: '$599', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Pantalón Wide Leg', precio: '$549', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Crop Top Punto', precio: '$329', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=500&auto=format&fit=crop&q=60' }
  ],
  nike: [
    { nombre: 'Windrunner', precio: '$1,899', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Top Dri-FIT', precio: '$699', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Leggings Sport', precio: '$899', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1506619216599-9d16d7e5a3e1?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Camiseta Sportswear', precio: '$649', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Pantalón Club', precio: '$1,099', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=500&auto=format&fit=crop&q=60' }
  ],
  adidas: [
    { nombre: 'Camiseta Essentials', precio: '$699', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Jogger Urbano', precio: '$1,199', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Chaqueta Track', precio: '$1,899', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Short Deportivo', precio: '$649', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Sudadera Crew', precio: '$1,399', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500&auto=format&fit=crop&q=60' }
  ],
  'h&m': [
    { nombre: 'Trench Coat', precio: '$2,499', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Pantalón Cargo', precio: '$999', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Camisa Viscosa', precio: '$699', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Falda Midi', precio: '$799', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Punto Grueso', precio: '$1,199', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=500&auto=format&fit=crop&q=60' }
  ],
  bershka: [
    { nombre: 'Chaqueta Cropped', precio: '$1,199', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Pantalón Baggy', precio: '$999', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Top Punto', precio: '$699', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Falda Plisada', precio: '$799', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Camisa Oversize', precio: '$899', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&auto=format&fit=crop&q=60' }
  ],
  amazon: [
    { nombre: 'Camisa Oxford', precio: '$799', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Jogger Casual', precio: '$699', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Chaqueta Acolchada', precio: '$1,499', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Pantalón Chino', precio: '$849', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Sudadera Básica', precio: '$899', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500&auto=format&fit=crop&q=60' }
  ],
  'el palacio de hierro': [
    { nombre: 'Blazer Sastre', precio: '$3,890', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Pantalón Recto', precio: '$1,990', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Camisa de Seda', precio: '$2,450', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Falda Lápiz', precio: '$1,790', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Abrigo Camel', precio: '$4,990', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=500&auto=format&fit=crop&q=60' }
  ],
  'studio f': [
    { nombre: 'Blazer Entallado', precio: '$2,299', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Pantalón Palazzo', precio: '$1,499', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Blusa Fluida', precio: '$899', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Jean Skinny', precio: '$1,299', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Vestido Bodycon', precio: '$1,799', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=500&auto=format&fit=crop&q=60' }
  ],
  'c&a moda': [
    { nombre: 'Chaqueta Denim', precio: '$1,299', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Pantalón Chino', precio: '$899', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Camisa Denim', precio: '$799', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Falda Corta', precio: '$699', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=500&auto=format&fit=crop&q=60' },
    { nombre: 'Vestido Camisero', precio: '$1,099', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=500&auto=format&fit=crop&q=60' }
  ]
};

const FALLBACK_GARMENTS = [
  { nombre: 'Camiseta Básica', precio: '$499', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=60' },
  { nombre: 'Pantalón Clásico', precio: '$899', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500&auto=format&fit=crop&q=60' },
  { nombre: 'Blusa Casual', precio: '$699', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=500&auto=format&fit=crop&q=60' },
  { nombre: 'Falda A-Line', precio: '$599', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=500&auto=format&fit=crop&q=60' },
  { nombre: 'Chaqueta Ligera', precio: '$1,199', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=500&auto=format&fit=crop&q=60' },
  { nombre: 'Jeans Slim', precio: '$999', categoria: 'Piernas', imagenUrl: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=500&auto=format&fit=crop&q=60' },
  { nombre: 'Vestido Camisero', precio: '$1,299', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=500&auto=format&fit=crop&q=60' },
  { nombre: 'Sudadera Oversize', precio: '$899', categoria: 'Torso', imagenUrl: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=500&auto=format&fit=crop&q=60' }
];

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function detectBrand(url) {
  const lower = url.toLowerCase();
  for (const brand of Object.keys(BRAND_GARMENTS)) {
    if (lower.includes(brand)) {
      return brand;
    }
  }
  return null;
}

async function escanearUrl(url) {
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const brand = detectBrand(url);
  let garment;

  if (brand) {
    const items = BRAND_GARMENTS[brand];
    const idx = simpleHash(url) % items.length;
    garment = items[idx];
  } else {
    const idx = simpleHash(url) % FALLBACK_GARMENTS.length;
    garment = FALLBACK_GARMENTS[idx];
  }

  const id = `scanned_${simpleHash(url + Date.now().toString())}`;

  return {
    id,
    ...garment
  };
}

module.exports = {
  escanearUrl
};