# Trender — Frontend (Angular 22)

Aplicación web de Trender: landing, cuenta (registro / login), configurador de avatar 3D
(Three.js) y escáner de prendas por URL. Consume la API del backend (carpeta raíz del repo).

## Requisitos

- Node.js **22.22.3+** o 24 (Angular 22 no arranca con versiones anteriores).
- El backend corriendo en `http://localhost:3000` (ver `README.md` de la raíz).
  La URL se configura en `src/environments/environment.ts`.

## Comandos (desde esta carpeta `frontend/`)

```bash
npm install
npm start                   # http://localhost:4200
npm test -- --watch=false   # pruebas (Vitest)
npm run build               # build de producción en dist/frontend
```

## Cómo está hecho

| Carpeta | Qué contiene |
|---|---|
| `src/app/probador/` | Lógica pura (sin WebGL): contornos y proporciones del cuerpo, tallas y catálogo de prendas |
| `src/app/motor-3d/` | Motor Three.js: maniquí paramétrico, prendas como capas sobre el cuerpo, telas y escena |
| `src/app/visor-3d/` | Componente que muestra el motor (giro, encuadre, aviso sin WebGL) |
| `src/app/servicios/` | Sesión (`auth`), perfil con medidas y conjunto (`perfil`) y escáner (`ropa`) |
| `src/app/avatar-setup/` | Página: cuerpo → prenda → talla, cuenta y visor |

El avatar se construye con secciones elípticas suavizadas (Catmull-Rom) a partir de género,
altura, peso y tipo de cuerpo; pecho, cintura y cadera se estiman o se toman de las medidas
exactas. Las prendas se generan sobre ese mismo cuerpo con holgura, caída y vuelo según su tipo.

## API que usa

| Uso | Endpoint |
|---|---|
| Crear cuenta / iniciar sesión | `POST /api/auth/register`, `POST /api/auth/login` |
| Refrescar y cerrar sesión | `GET /api/auth/me`, `POST /api/auth/logout` |
| Medidas y conjunto | `GET` / `PUT /api/profile` (estatura en `altura`; peso, género, tipo de cuerpo y conjunto en `avatar_config`) |
| Escáner de prendas | `POST /api/ropa/escanear-link` |
