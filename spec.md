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
Run: `npm test` (must pass before commit).

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

*End of specification. Keep this file in sync with code changes.*