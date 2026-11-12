# Trender — Project Specification

> **Source of truth** for architecture, contracts, and operational details.  
> Generated from `Documentacion/`, `Contexto.md`, `Despliegue.md`, and live `src/` code.

---

## 1. Project Summary

**Purpose**: A lightweight **webhook middleware API** that receives HTTP POST notifications from external systems (payment gateways, CRMs, form providers), validates payloads, persists data, triggers internal notifications (email), and acknowledges receipt with `200 OK`.

**Core Use Cases**

| ID | Scenario | Flow |
|----|----------|------|
| **UC-A** | **Successful Payment** | External gateway → `POST /webhooks/recibir` (transaction_id, amount, customer_email) → validate → `db.service.guardarDatos()` → `email.service.enviarAlerta()` → `200 { status: "success" }` |
| **UC-B** | **Invalid Payload** | External system sends malformed/empty JSON → validator rejects → `400 { status: "error", message: "..." }` (no side effects) |

**Success Criteria** (from `Contexto.md`)
- Handle 100 concurrent requests without crash
- All inbound data validated before DB touch
- Full request/response logging (morgan)
- New webhook providers addable in < 2 hours

---

## 2. Architecture

**Pattern**: Layered **Routes → Controllers → Services** (strict separation)

```
src/
├── index.js                 # Entry point: loads .env, starts server
├── app.js                   # Express setup, global middleware, route mounting
├── rutas/
│   ├── index.routes.js      # /api/health
│   └── webhooks.routes.js   # /webhooks/recibir (POST)
├── controladores/
│   └── main.controller.js   # Orchestration only (validate → call services → respond)
└── servicios/
    ├── db.service.js        # guardarDatos(datos) — mock persistence
    └── email.service.js     # enviarAlerta(mensaje) — mock notification
```

**Rules**
- **Services** = pure business logic, zero HTTP awareness
- **Controllers** = thin: extract `req.body`, call services, format HTTP response
- **Routes** = validation middleware (`express-validator`) **before** controller
- **Global middleware** (CORS, Helmet, Morgan, Rate Limit) in `app.js`
- `index.js` **only** calls `app.listen()`

---

## 3. Tech Stack

| Category | Dependency | Version (package.json) |
|----------|------------|------------------------|
| Runtime | Node.js | — |
| Framework | **express** | ^5.2.1 |
| Config | **dotenv** | ^18.0.5 |
| Dev Tooling | **nodemon** | (dev) |
| Testing | **jest**, **supertest** | (dev, per `Pruebas.md`) |
| Security | **cors**, **helmet**, **express-validator**, **express-rate-limit** | (per `seguridadyvalidaciones.md`) |
| Logging | **morgan** | (per `ManejodeErrores.md`) |

**Scripts** (`package.json`)
```json
{
  "dev": "nodemon src/index.js",
  "start": "node src/index.js",
  "test": "jest --detectOpenHandles"
}
```

---

## 4. Data Contracts & Interfaces

### Webhook Inbound Payload (`POST /webhooks/recibir`)

**Expected shape** (validated by controller; `express-validator` middleware to be added per `seguridadyvalidaciones.md`):

```json
{
  "transaction_id": "string (required)",
  "amount": "number (required, > 0)",
  "customer_email": "string (required, email format)",
  "currency": "string (optional, default 'USD')",
  "metadata": "object (optional)"
}
```

**Validation Rules** (current + planned)
| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `transaction_id` | ✅ | string | Unique identifier from provider |
| `amount` | ✅ | number | Positive, two decimals max |
| `customer_email` | ✅ | string | RFC 5322 email |
| `currency` | ❌ | string | ISO 4217, default `USD` |
| `metadata` | ❌ | object | Free-form provider data |

**Empty/invalid body** → `400 { status: "error", message: "Cuerpo de la petición vacío" }` (current controller guard)

---

## 5. API Endpoints

### `GET /api/health`
**Health check** — no auth, no rate limit.

| Response | Body |
|----------|------|
| `200 OK` | `{ "status": "ok", "message": "Trender server is running" }` |

---

### `POST /webhooks/recibir`
**Receive external webhook** — rate-limited (100 req / 15 min / IP, per `seguridadyvalidaciones.md`).

| Request | Response |
|---------|----------|
| **Headers** `Content-Type: application/json` | |
| **Body** Webhook payload (see §4) | **200** `{ "status": "success", "message": "Webhook procesado" }` |
| | **400** `{ "status": "error", "message": "Cuerpo de la petición vacío" }` (empty) |
| | **400** Validation errors array (once `express-validator` added) |
| | **500** `{ "error": "Internal Server Error" }` (centralized handler) |

**Side Effects on 200**
1. `db.service.guardarDatos(payload)` — logs `"Datos guardados en base de datos"`
2. `email.service.enviarAlerta(\`Webhook recibido con datos: ${JSON.stringify(payload)}\`)` — logs email mock

---

## 6. Operational Notes

### Environment Variables (`.env` — **never committed**)
| Key | Default | Description |
|-----|---------|-------------|
| `PORT` | `3000` | HTTP listen port |
| `ALLOWED_ORIGINS` | `*` | CORS allow-list (production) |

### Production Hardening (from `Despliegue.md`)
- **Process manager**: PM2 (`npm run start:prod`)
- **Container**: `Dockerfile` (node:18-alpine, `npm ci --only=production`)
- **Secrets**: `.env.example` with keys only
- **Audit**: `npm audit` before deploy

### Security Baseline (from `seguridadyvalidaciones.md`)
- `app.use(cors())` global
- `app.use(helmet())` before routes
- Rate limiter **only** on `/webhooks`
- `express-validator` middleware in `webhooks.routes.js` **before** controller
- Centralized error handler (`error.controller.js`) registered **last** in `app.js`
- 404 handler before error handler

### Testing Requirements (from `Pruebas.md`)
```
tests/
├── webhooks.test.js   # POST /webhooks/recibir → 200 / 400
└── servicios.test.js  # db.service, email.service unit tests
```
Run: `npm test` (must pass before commit). Additional suites: `tests/auth.test.js`, `tests/closet.test.js` (see §9).

---

## 7. File Index (Current)

```
.
├── AGENTS.md                  # Agent system prompt (this repo)
├── Contexto.md                # Business context & use cases
├── Despliegue.md              # Production deployment guide
├── ManejodeErrores.md         # Error handling spec
├── Pruebas.md                 # Testing strategy
├── seguridadyvalidaciones.md  # Security & validation spec
├── package.json
├── package-lock.json
├── .env                       # (gitignored)
├── .gitignore
├── Documentacion/
│   ├── estructura.md
│   ├── Comandos.md
│   ├── Herramientas.md
│   └── serviciosywebhooks.md
└── src/
    ├── index.js
    ├── app.js
    ├── controladores/
    │   └── main.controller.js
    ├── rutas/
    │   ├── index.routes.js
    │   └── webhooks.routes.js
    └── servicios/
        ├── db.service.js
        └── email.service.js
```

---

## 8. Extension Points

| To Add | Where | Steps |
|--------|-------|-------|
| **New webhook provider** | `src/rutas/<provider>.routes.js` + `src/controladores/<provider>.controller.js` | 1. Define validation schema 2. Mount under `/webhooks/<provider>` 3. Add tests in `webhooks.test.js` |
| **New service** | `src/servicios/<name>.service.js` | Export pure functions; test in `servicios.test.js` |
| **Real DB / Email** | Replace mocks in `db.service.js` / `email.service.js` | Keep controller unchanged |
| **Auth on webhooks** | Middleware in `webhooks.routes.js` | Verify HMAC / API key before validator |


---

## 9. Trender — Cuentas, Perfil y Armario (API REST para Angular y Flutter)

Todas las respuestas son JSON. Éxito: `{ "status": "success", "data": … }`. Error:
`{ "status": "error", "error": "mensaje", "code"?: "CODIGO", "errors"?: [{ "field", "message" }] }`.

### Autenticación

JWT HS256 en `Authorization: Bearer <token>`. El token lleva `sub` (user id) y `sid` (fila de
`sessions`); el middleware `requerirAuth` exige firma válida **y** sesión no revocada ni expirada,
así el logout invalida el token aunque su firma siga vigente. Contraseñas con bcrypt (12 rondas).

| Método | Ruta | Auth | Cuerpo | Respuesta |
|---|---|---|---|---|
| POST | `/api/auth/invitado` | — | — | `201 { user, token, expires_at, session_id }` — sesión anónima (20/h/IP) |
| POST | `/api/auth/register` | — | `{ nombre?(1–80), email, password(8–72 bytes) }` | `201 { user, token, expires_at, session_id }` · `409 EMAIL_EN_USO` |
| POST | `/api/auth/login` | — | `{ email, password }` | `200 { user, token, expires_at, session_id }` · `401 CREDENCIALES_INVALIDAS` |
| POST | `/api/auth/logout` | ✅ | — | `200 { revoked: true }` — revoca la sesión y limpia la caché del usuario |
| GET | `/api/auth/me` | ✅ | — | `200 { user, profile }` |
| GET | `/api/profile` | ✅ | — | `200 { altura, pecho, cintura, cadera, avatar_config, updated_at }` |
| PUT | `/api/profile` | ✅ | campos parciales (cm, `null` borra) + `avatar_config` objeto | `200` perfil |
| GET | `/api/closet?genero=&category=` | ✅ | — | `200 { items, count }` (armario de un género) |
| POST | `/api/closet/subir?genero&nombre&category` | ✅ | imagen (cuerpo `image/*`, ≤ 12 MB) | `202` prenda `processing` · `400` · `409 PRENDA_DUPLICADA` · `413` · `415 IMAGEN_INVALIDA` · `422 IMAGEN_PEQUENA` |
| POST | `/api/closet/:id/foto` | ✅ | imagen (cuerpo `image/*`) | `202` la prenda vuelve a `processing` con la nueva foto · `404` · `409 EN_PROCESO` |
| GET | `/api/closet/:id` | ✅ | — | `200` prenda (consultar hasta `ready` / `review` / `failed`) · `404` si es de otro usuario |
| PATCH | `/api/closet/:id` | ✅ | `{ category, tipo? }` | `200` prenda (una prenda en `review` pasa a `ready`) |
| DELETE | `/api/closet/:id` | ✅ | — | `200 { id, deleted: true }` (borra también su recorte) |
| GET | `/media/closet/<user>/<id>.png` | — | — | recorte PNG con transparencia (rutas con UUID; `Cross-Origin-Resource-Policy: cross-origin` para WebGL) |

`prenda` = `{ id, nombre, categoria: 'Torso'|'Piernas'|'Calzado'|'Vestido'|null, tipo, confianza:
'alta'|'media'|'baja'|'ninguna', color: { nombre, hex }|null, precio|null, marca|null, imagen|null, tienda,
fuente: 'pagina'|'url', motivo|null }`. El escáner lee la página del producto (título, JSON-LD
`Product`, migas de pan, `og:*`) con protección SSRF (solo IPs públicas, 3 redirecciones, 6 s,
1.5 MB) y clasifica con un diccionario ES/EN ponderado. Si no hay evidencia devuelve
`categoria: null` y un `motivo` en lugar de adivinar; los accesorios se reconocen y no se visten.

Prenda del armario = `{ id, genero, source_url, imagen_url, category: top|bottom|dress|shoes|null, tipo,
nombre, color, tienda, precio, status: processing|ready|review|failed, error, analisis: { confianza,
evidencias[], avisos[], metodoLectura, metodoRecorte, fotosEvaluadas[], silueta }, created_at, updated_at }`.

### Fotos de prendas (análisis asíncrono)

1. `POST /api/closet/subir` valida la imagen (formato, tamaño), inserta la prenda `processing` y responde **202**.
   Un `?tipo=` opcional (respuesta del usuario: "es una sudadera") manda sobre el análisis.
2. Una cola en memoria (2 en paralelo) ejecuta `importacion.procesarFoto`:
   - `imagen.service` (Sharp): calidad de la foto; quita el fondo (remove.bg si hay `REMOVE_BG_API_KEY`;
     si no, recorte local: relleno desde el borde, o modelo de fondo aprendido del borde para fotos
     caseras con varios colores/degradados, huecos encerrados, limpieza de hilos).
   - `vision.service`: silueta (perneras, escote, mangas, capucha, falda, calzado de perfil, par de
     zapatos), abertura al frente, puños de jogger, colores con nombre, estampado, tela probable y zonas
     de la foto (torso y mangas) para el 3D; tipos alternativos para el cuestionario.
   - `decidir`: el nombre que escribió el usuario manda si es claro; si no, decide la foto; si ninguno es
     concluyente la prenda queda en `review`.
3. El cliente consulta `GET /api/closet/:id` hasta `ready`, `review` o `failed`.
4. `PATCH /api/closet/:id` guarda tipo y `ajustes` del cuestionario (ajuste, largo, manga, capucha, cuello).

### Aislamiento por cuenta

Los servicios reciben siempre `req.auth.userId` y toda consulta incluye `user_id = ?`. Un id de
otro usuario responde `404` (igual que uno inexistente) para no revelar su existencia.

### Esquema SQLite (migraciones en `src/servicios/migraciones.service.js`)

| Tabla | Columnas |
|---|---|
| `users` | id (uuid), email (único, sin mayúsculas), password_hash, created_at |
| `user_profiles` | id, user_id (FK único, cascade), altura, pecho, cintura, cadera (cm, CHECK de rango), avatar_config_json (JSON válido), updated_at |
| `closet_items` | id, user_id (FK cascade), source_url (único por usuario), image_path (reservado `closet/<user>/<id>.png`), category (`top`/`bottom`/`shoes`), status (`pending`/`processing`/`ready`/`failed`), created_at, updated_at |
| `sessions` | id (= claim `sid`), user_id (FK cascade), user_agent, created_at, expires_at, revoked_at |
| `schema_migrations` | version, nombre, applied_at |

Las migraciones se aplican solas al abrir la base (`db.service.js`) o con `npm run db:migrate`.
Una base creada por el prototipo anterior (`users` + `user_measurements`) se migra conservando
los datos: estatura → `altura`, peso/complexión/género → `avatar_config_json`.
`dev.db` no se versiona (`.gitignore`): se crea sola al arrancar.

### Ingesta por link

`url.service.js` acepta solo http(s), sin credenciales embebidas ni hosts internos (localhost, IPs
privadas/link-local, `.local`, etc.) y elimina el fragmento `#`. La prenda queda `pending` con su
`image_path` reservado y la carpeta creada en `UPLOADS_DIR`; el servicio de recorte (pendiente)
deberá volver a validar la resolución DNS al descargar.

### Frontend

La aplicación Angular vive en `frontend/` (rama de frontend) y consume esta API desde
`environment.apiUrl` (`http://localhost:3000`): `/api/auth/*`, `/api/profile` (estatura en `altura`,
contornos exactos en `pecho/cintura/cadera`, y peso, género, tipo de cuerpo y conjunto en
`avatar_config`)  `POST /webhooks/recibir`
sigue aceptando `avatar_data` para integraciones externas.

### Variables de entorno adicionales

| Key | Default | Descripción |
|---|---|---|
| `JWT_SECRET` | aleatorio por proceso (dev) | **Obligatorio en producción** |
| `JWT_EXPIRES_IN_SECONDS` | `604800` | Vida del token / sesión |
| `BCRYPT_ROUNDS` | `12` | Coste de bcrypt |
| `DATABASE_URL` | `./dev.db` | Ruta SQLite (`:memory:` en pruebas) |
| `UPLOADS_DIR` | `./uploads` | Imágenes procesadas del armario |
| `AUTH_RATE_LIMIT` | `30` | Peticiones de login/registro por 15 min |
| `REMOVE_BG_API_KEY` | — | Recorte con remove.bg; sin clave se usa el recorte local |
| `GUEST_RATE_LIMIT` / `IMPORT_RATE_LIMIT` | `20` / `40` | Sesiones de invitado por hora / importaciones por 15 min (por IP) |

Pruebas: `tests/auth.test.js`, `tests/closet.test.js`, `tests/ropa.test.js`, `tests/fotos.test.js`, `tests/imagen.test.js`, `tests/importacion.test.js`, `tests/servicios.test.js`, `tests/webhooks.test.js`
(cada archivo con su propia base en memoria).
---

*End of specification. Keep this file in sync with code changes.*
