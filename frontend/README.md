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

## API que usa

| Uso | Endpoint |
|---|---|
| Crear cuenta / iniciar sesión | `POST /api/auth/register`, `POST /api/auth/login` |
| Refrescar y cerrar sesión | `GET /api/auth/me`, `POST /api/auth/logout` |
| Medidas del avatar | `GET` / `PUT /api/profile` (estatura en `altura`; peso, complexión y género en `avatar_config`) |
| Escáner de prendas | `POST /api/ropa/escanear-link` |
| Generar modelo | `POST /webhooks/recibir` con `avatar_data` |
