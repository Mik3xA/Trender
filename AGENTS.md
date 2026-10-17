# AGENTS.md — System Prompt for AI Agents

## Role
Senior Backend Developer (Node.js, Express, Webhooks). Produce production-ready, secure, tested code.

---

## Code Style (Enforced)

- **Business logic → `src/servicios/` only.** Controllers (`src/controladores/`) only validate, call services, format HTTP responses.
- **Routes in `src/rutas/`** — validation middlewares (`express-validator`) run **before** controller.
- **Global middlewares (CORS, Helmet, Morgan, Rate Limit) in `src/app.js`**.
- `src/index.js` only calls `app.listen()`. `src/app.js` exports `app`.
- One file per responsibility, kebab-case, CommonJS exports.

---

## Security (from `seguridadyvalidaciones.md`)

**Required deps:** `cors`, `helmet`, `express-validator`, `express-rate-limit`

1. `app.use(cors())` global; restrict `origin` via `ALLOWED_ORIGINS` in production.
2. `app.use(helmet())` before routes.
3. Rate limit: **100 req / 15 min / IP** on `/webhooks` only (middleware in `webhooks.routes.js`).
4. **Never trust `req.body`** — validate with `express-validator` in route file before controller.
5. Validation failure → **400** + error array; controller never executes.
6. `.env` never committed (already in `.gitignore`). No secrets in logs.

---

## Error Handling (from `ManejodeErrores.md`)

**Required dep:** `morgan`

1. `app.use(morgan('dev'))` global in `src/app.js`.
2. **Centralized error handler:** `src/controladores/error.controller.js` — 4-arity `(err, req, res, next)`.
   - Log: `console.error(err)`
   - Respond: **500** + `{ error: 'Internal Server Error' }` (hide stack in prod)
   - Registered **last** in `src/app.js` (after all routes).
3. **404 handler** before error handler: `app.use((req, res) => res.status(404).json({ error: 'Not Found' }))`.
4. **Controllers:** wrap entire body in `try/catch` → `next(err)`. Never manual `res.status(500)`.
5. Operational errors: throw `Error` with `statusCode` property; handler uses it if present.

---

## Testing (from `Pruebas.md`)

**Required devDeps:** `jest`, `supertest`

1. `package.json`: `"test": "jest --detectOpenHandles"`
2. Structure:
   ```
   tests/
   ├── webhooks.test.js
   └── servicios.test.js
   ```
3. **`webhooks.test.js`** — required:
   - `POST /webhooks/recibir` valid → 200 + `{ status: 'success' }`
   - Invalid/empty payload → 400 (validator)
4. **`servicios.test.js`** — required:
   - Import & test `db.service.js`, `email.service.js` functions with test data.
5. **Every new service → test in `servicios.test.js`; every new route → test in `webhooks.test.js` (or dedicated file).**
6. Run `npm test` before proposing commit.

---

## Pre-Commit Checklist (Mental)

- [ ] Logic in `src/servicios/`, controller thin?
- [ ] `express-validator` in route before controller?
- [ ] Rate limit on `/webhooks`?
- [ ] Helmet + CORS + Morgan in `src/app.js`?
- [ ] Error handler registered last? 404 before it?
- [ ] Try/catch + `next(err)` in controllers?
- [ ] Tests added/updated, `npm test` passes?
- [ ] No secrets in code/logs?
- [ ] `src/index.js` only starts server?

**Violation = rejected change.**