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
- **Cuestionario**: `PATCH /api/closet/:id` con `{ category, tipo?, ajustes? }`, donde `ajustes` admite
  `ajuste` (ajustado/regular/holgado), `largo` (corto/normal/largo), `manga` (sin/corta/tres-cuartos/larga),
  `capucha` y `cuello` (true/false). El avatar 3D usa estas respuestas para vestir la prenda.
  También se puede decir el tipo al subir: `POST /api/closet/subir?tipo=sudadera`.
- **Cambiar la foto** de una prenda: `POST /api/closet/:id/foto` (mismo formato que `subir`).

### Prueba con IA (tu foto + tus prendas)

1. `POST /api/persona` con una foto tuya de cuerpo entero (imagen en el cuerpo). Se guarda en una carpeta
   **privada** (`PRIVATE_DIR`, por defecto `privado/`) y solo se sirve con tu sesión: `GET /api/persona/:id/imagen`.
2. `POST /api/pruebas` con `{ personaId, prendas: [{ id, usar? }] }` (1 a 4 prendas; de un outfit completo
   puedes usar solo algunas partes: `usar: ["top"]`). Responde 202; consulta `GET /api/pruebas/:id` hasta
   `ready` y descarga `GET /api/pruebas/:id/imagen`.

Proveedor de IA (en `.env`):

| Variable | Qué hace |
| --- | --- |
| `GEMINI_API_KEY` | Google Gemini (edición de imagen). Viste todas las prendas en una sola petición, incluido calzado y partes de un outfit. Clave en https://aistudio.google.com/apikey |
| `FASHN_API_KEY` | FASHN (modelo especializado en try-on). Una petición por prenda; no viste calzado. |
| `TRYON_PROVIDER` | `gemini`, `fashn` o `local`. Vacío = el que tenga clave. |

Sin claves se usa `local`: una **vista previa aproximada** que superpone los recortes sobre tu foto (no es una
foto realista; sirve para probar el flujo). `GET /api/pruebas/estado` dice qué proveedor está activo.

Opcional, para recortes de mayor calidad: `REMOVE_BG_API_KEY` en `.env` (remove.bg).

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
