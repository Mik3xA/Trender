# AGENTS.md — Guía Full-Stack Trender

## Stack
- **Backend:** Node.js + Express 5 + SQLite (`better-sqlite3`) + Nodemailer + JWT (`jsonwebtoken`) + `bcrypt`. Sin Python, Java ni TypeScript en el backend.
- **Frontend:** Angular 22 Standalone + Three.js + Tailwind CSS.
- **Integración:** HTTP JSON hacia `${environment.apiUrl}`: `/api/auth/*`, `/api/profile`, `/api/closet`, `/api/ropa/escanear-link` y `/webhooks/recibir`. Contrato completo en `spec.md` §9.
- **Ramas:** el backend (todo lo que está fuera de `frontend/`) y el frontend (`frontend/`) se desarrollan en ramas separadas que no tocan los archivos de la otra, para fusionar en `main` sin conflictos.

---

## Arquitectura backend

- **Lógica de negocio → `src/servicios/` únicamente.**
- **Controladores → `src/controladores/`**: validan, llaman servicios y formatean respuestas HTTP.
- **Rutas → `src/rutas/`**: los middlewares de `express-validator` se ejecutan **antes** del controlador.
- **Middlewares globales (CORS, Helmet, Morgan) → `src/app.js`.**
- `src/index.js` solo arranca el servidor con `app.listen()`.
- `src/app.js` exporta `app`.
- Un archivo por responsabilidad, kebab-case, exports CommonJS.

---

## Arquitectura frontend

- Componentes **Standalone** de Angular 22, estado con signals.
- La URL del backend se obtiene siempre de `frontend/src/environments/environment*.ts`.
- Prohibido hardcodear `http://localhost:3000` fuera de los archivos de entorno.
- **Sin login:** `servicios/sesion.service.ts` crea una sesión de invitado (`POST /api/auth/invitado`) y su interceptor añade el token a la API y reintenta una vez ante un 401.
- **Layout de pantalla completa:** barra superior con los apartados **Mujer / Hombre**, panel lateral colapsable (importar, cuerpo, talla), visor 3D central y armario inferior.
- **Apartados independientes:** cada género tiene su cuerpo, tono, conjunto y armario (`closet_items.genero`).
- Estructura del probador:
  - `app/probador/`: lógica pura y probada sin WebGL: `cuerpo.ts` (contornos y proporciones a partir de género, altura, peso, tipo de cuerpo fit/delgado/normal/sobrepeso y medidas opcionales), `tallas.ts` y `prendas.ts`.
  - `app/motor-3d/`: Three.js sin Angular. `geometria.ts` (loft y tubos con normales hacia fuera), `cuerpo-3d.ts` (cuerpo y prendas como capas), `telas.ts` (telas procedimentales y proyección de la foto real de la prenda), `piel.ts` (piel PBR), `avatar-glb.ts` (avatar realista opcional con morph targets) y `motor-avatar.ts`.
  - `app/visor-3d/`: componente que crea y destruye `MotorAvatar`.
- **Three.js** debe liberar geometrías, materiales, texturas, renderer y observadores al destruir el visor.
- El visor 3D debe mantener un `ResizeObserver` sobre su contenedor y mostrar un aviso si no hay WebGL.
- La importación es asíncrona: `POST /api/closet/importar` responde 202 y `ArmarioService` consulta `GET /api/closet/:id` cada segundo hasta `ready`, `review` o `failed`.
- Si no se identifica la prenda (`review`) el usuario elige la categoría; nunca se viste una prenda adivinada.
- Prohibido implementar carga de modelos `.GLB` por parte del usuario (los avatares GLB se configuran en el entorno).

---

## Paleta mate

| Uso | Color |
|---|---|
| Fondos y contenedores (negro mate) | `#0e0e0d`, `#151514`, `#1c1c1a` |
| Acento (verde oliva) | `#6b7041` (claro `#8a8f58`) |
| Texto y bordes de 1 px (blanco hueso) | `#ece8de` (bordes al 14 %) |

Diseño plano: **sin** glassmorphism, sombras difusas ni degradados en la interfaz. Variables en `frontend/tailwind.config.js` y estilos globales en `frontend/src/styles/_estudio.scss`.

**Prohibido:** tonos neón, cyan, azul neón, magenta, morado brillante, fucsia, índigo y violeta.

**Prohibido:** emojis en la interfaz.

**Prohibido:** usar “IA” o “Inteligencia Artificial” en copy, código o documentación. Sustituir por “Motor Biométrico Local”, “Cálculo Paramétrico”, “Fotogrametría 3D” o “Mapeo Procedural”.

**Iconografía:** SVG inline estilo Lucide / Heroicons, `stroke-width="1.5"` y clases `w-5 h-5`.

---

## Seguridad

Dependencias requeridas: `cors`, `helmet`, `express-validator`, `express-rate-limit`, `morgan`, `jsonwebtoken`.

1. `helmet()` antes de las rutas.
2. `morgan('dev')` global.
3. CORS abierto en desarrollo y restringido por `ALLOWED_ORIGINS` en producción.
4. Rate limit de **100 requests / 15 minutos / IP** en `/webhooks`.
5. Rate limit de **30 requests / 15 minutos / IP** en `/api/auth/register` y `/api/auth/login`.
6. **Nunca confiar en `req.body`:** validar con `express-validator` en la ruta antes del controlador.
7. Fallo de validación → **400** con array `{ field, message }`; el controlador no se ejecuta.
8. Contraseñas con `bcrypt` (12 rondas). Los hashes `scrypt` del prototipo se aceptan y se convierten a bcrypt en el siguiente login.
9. JWT HS256 firmado con `JWT_SECRET` y ligado a una fila de `sessions` (claim `sid`); en producción el secreto es obligatorio.
10. Aislamiento por cuenta: toda consulta de datos de usuario filtra por `req.auth.userId`; un recurso ajeno responde 404.
11. `.env` y `dev.db` nunca se commitean. Sin secretos ni tokens en logs.

---

## Validación de `POST /webhooks/recibir`

Campos obligatorios:
- `transaction_id`: string no vacío.
- `amount`: número mayor a 0.
- `customer_email`: email válido.

Campos opcionales:
- `currency`: string ISO de 3 letras.
- `metadata`: objeto.
- `avatar_data`: objeto con:
  - `estatura`: número mayor a 0.
  - `peso`: número mayor a 0.
  - `complexion`: string no vacío.
  - `genero`: string (enviado por el frontend).

Respuesta exitosa: **200** con `{ status: 'success' }`.
Error de validación: **400** con `{ status: 'error', errors: [...] }`.

---

## Autenticación `/api/auth`

- `POST /register`: `nombre` opcional (1 a 80 caracteres; si falta se deriva del email), email y contraseña de 8 a 72 bytes; 201 con `{ status, data: { user, token, expires_at, session_id } }`.
- `POST /login`: email y contraseña; 200 con el mismo formato; credenciales inválidas 401 (mismo mensaje si el email no existe).
- `POST /logout`: requiere `Authorization: Bearer <token>`; revoca la sesión y limpia la caché del usuario. El token deja de servir (401).
- `GET /me`: requiere token; devuelve `{ user, profile }` con `user.nombre`.
- No existe acceso por código fijo (el OTP `123456` de la demo se eliminó: daba un token válido para cualquier email).
- Google OAuth está prohibido. El frontend web usa sesión de invitado (`POST /invitado`); registro y login quedan para otros clientes (app Flutter).
- `JWT_SECRET` en `.env`; nunca hardcodear el secreto.

---

## Manejo de errores

- `src/controladores/error.controller.js` con firma `(err, req, res, next)`.
- Log con `console.error(err)`.
- Error interno → **500** + `{ error: 'Internal Server Error' }`.
- Errores operacionales con `statusCode` respetan dicho código.
- Ocultar `stack` en producción.
- Handler 404 antes del error handler:
```js
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));
```
- El error handler se registra **al final** de `src/app.js`.
- Controladores envuelven su cuerpo en `try/catch` y llaman `next(err)`.

---

## Pruebas

### Backend
```bash
npm test
```
- `tests/webhooks.test.js`: éxito 200, `avatar_data`, validación 400 y rutas inexistentes.
- `tests/auth.test.js`: registro con nombre, login, logout, `/me` y `/api/profile`.
- `tests/closet.test.js`: armario y aislamiento entre usuarios.
- `tests/ropa.test.js`: clasificador de texto, extracción de metadatos y SSRF.
- `tests/scraper.test.js`: adaptadores por tienda y detección de bloqueos.
- `tests/imagen.test.js`: elección de foto, recorte, silueta y color (imágenes sintéticas).
- `tests/importacion.test.js`: importación completa, invitados y armario por género.
- Las pruebas nunca salen a internet (`SCAN_FETCH_PAGES=false`, `SCRAPER_BROWSER=false`).
- `tests/servicios.test.js`: servicios (`db`, migraciones, `auth`, `perfil`, `closet`, `ropa`, `email`, caché, URLs).

### Frontend
```bash
cd frontend
npm test -- --watch=false
npm run build
```

Toda nueva ruta backend requiere prueba en su archivo de `tests/`. Todo nuevo servicio backend requiere prueba en `servicios.test.js`. Todo flujo frontend relevante requiere prueba en el spec del componente o del servicio.

---

## Checklist pre-commit

- [ ] ¿Lógica en servicios y controladores delgados?
- [ ] ¿Validación en la ruta antes del controlador?
- [ ] ¿Rate limit en `/webhooks` y en login/registro?
- [ ] ¿Helmet + CORS + Morgan en `src/app.js`?
- [ ] ¿404 antes del error handler y error handler al final?
- [ ] ¿Frontend usa `environment.apiUrl`?
- [ ] ¿Paleta mate (negro, oliva, hueso) y SVG en lugar de emojis?
- [ ] ¿Sin “IA” ni “Inteligencia Artificial” en copy, código o documentación?
- [ ] ¿Sin pantalla de login (sesión de invitado en `SesionService`)?
- [ ] ¿Tests backend y frontend actualizados?
- [ ] ¿Sin secretos en código ni logs?
- [ ] ¿`src/index.js` solo arranca el servidor?
