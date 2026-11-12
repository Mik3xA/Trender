# Trender

Probador virtual: API REST en Node.js + Express + SQLite (raíz del repositorio) y
aplicación web en Angular (`frontend/`). La misma API está pensada para la futura app Flutter.

```
Trender/
├── src/           API (rutas → controladores → servicios)
├── tests/         pruebas del backend (Jest + Supertest)
├── frontend/      aplicación Angular (Three.js + Tailwind)
└── spec.md        contrato de la API (§9) y arquitectura
```

## Requisitos

- Node.js **22.22.3 o superior** (Angular 22 no arranca con versiones anteriores).
- npm 10+.

## 1. Backend (carpeta raíz)

```bash
npm install
cp .env.example .env        # pon un JWT_SECRET largo y ALLOWED_ORIGINS=http://localhost:4200
npm run dev                 # http://localhost:3000  (npm start sin recarga automática)
npm test                    # pruebas del backend
```

La base `dev.db` se crea y migra sola al arrancar (o con `npm run db:migrate`).

### Agregar prendas

- **Subir foto** (recomendado): `POST /api/closet/subir?genero=Femenino&nombre=...` con la imagen
  como cuerpo (`Content-Type: image/jpeg|png|webp|avif|heic`, máx. 12 MB). Responde 202 y la foto
  se analiza en segundo plano: recorte del fondo (también fondos caseros), tipo de prenda
  (superior, inferior, vestido o calzado y el tipo concreto), manga, largo, colores, estampado
  y zonas de la foto para el avatar 3D. Consulta `GET /api/closet/:id` hasta `ready`/`review`.
- **Link de tienda**: `POST /api/closet/importar`. Muchas tiendas bloquean la lectura automática;
  en ese caso la prenda se guarda con los datos del link y se le puede añadir una foto con
  `POST /api/closet/:id/foto` (mismo formato que `subir`). Un link directo a una imagen
  (`.jpg`, `.png`, `.webp`) se analiza como foto.

Opcional, para tiendas que bloquean la lectura automática (Amazon, captchas):
`npm install puppeteer` (descarga un Chromium de ~170 MB). Para recortes de mayor calidad,
`REMOVE_BG_API_KEY` en `.env` (remove.bg).

## 2. Frontend (carpeta `frontend/`)

En otra terminal, con el backend corriendo:

```bash
cd frontend
npm install
npm start                   # http://localhost:4200
npm test -- --watch=false   # pruebas del frontend
npm run build               # build de producción en frontend/dist/
```

La URL del backend está en `frontend/src/environments/environment.ts` (`http://localhost:3000`).

## Docker (solo backend)

```bash
docker build -t trender-api .
docker run -p 3000:3000 -e JWT_SECRET=... -v trender-data:/data trender-api
```
