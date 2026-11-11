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

- Componentes **Standalone** de Angular 22.
- La URL del backend se obtiene siempre de `frontend/src/environments/environment*.ts`.
- Prohibido hardcodear `http://localhost:3000` fuera de los archivos de entorno.
- **Diseño centrado en el contenido:** Top-Nav superior. Prohibido implementar sidebar.
- **Autenticación** centralizada en `frontend/src/app/servicios/auth.service.ts`; el componente no escribe la sesión directamente.
- **Three.js** debe liberar geometrías, materiales, renderer y observadores en `ngOnDestroy`.
- El visor 3D debe mantener un `ResizeObserver` sobre su contenedor.
- Estado de demo persistido en `localStorage` con acceso protegido y `JSON.parse` en `try/catch`.
- El flujo del webhook nunca debe romper el render 3D ante respuestas 200 o 400.
- Prohibido implementar carga de modelos `.GLB` por parte del usuario.
- Tras generar el modelo, la vista se desplaza suavemente hasta el visor 3D.
- El Navbar muestra `Hola, {nombre}` (nunca el correo) y "Mi Espacio de Medición" repite el nombre.
- El escáner de links (`/api/ropa/escanear-link`) no requiere sesión de Trender.
- El cierre de sesión llama a `POST /api/auth/logout` (revoca el token en el servidor) y limpia el estado local.

---

## Paleta Earth & Studio

| Uso | Color |
|---|---|
| Primario / acento | `#3f4e3b` (verde oliva profundo) |
| Acciones principales | `stone-900` (`#1c1917`) |
| Fondo carbón | `#18181b` |
| Blanco marfil / arena | `#fcfcf9` |
| Gris de estudio | `#f4f4f2` |
| Porcelana del maniquí | `#e7e5e1` |
| Ropa interior | `#2d3728` |

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
- Google OAuth está prohibido; la única vía es email y contraseña.
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
- `tests/ropa.test.js`: escáner (clasificador, extracción de metadatos, SSRF y endpoint). Las pruebas no salen a internet (`SCAN_FETCH_PAGES=false`).
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
- [ ] ¿Paleta Earth & Studio y SVG en lugar de emojis?
- [ ] ¿Sin “IA” ni “Inteligencia Artificial” en copy, código o documentación?
- [ ] ¿Top-Nav sin sidebar y autenticación centralizada en `AuthService`?
- [ ] ¿Tests backend y frontend actualizados?
- [ ] ¿Sin secretos en código ni logs?
- [ ] ¿`src/index.js` solo arranca el servidor?
