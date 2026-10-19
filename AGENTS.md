# AGENTS.md — Guía Full-Stack Trender

## Stack
- **Backend:** Node.js + Express 5 + SQLite (`better-sqlite3`) + Nodemailer + JWT (`jsonwebtoken`).
- **Frontend:** Angular 22 Standalone + Three.js + Tailwind CSS.
- **Integración:** HTTP JSON hacia `${environment.apiUrl}/webhooks/recibir` y `${environment.apiUrl}/api/auth/*`.

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
- El catálogo multi-tienda vive en `frontend/src/app/data/catalogos.data.ts`; todas las tiendas usan el mismo botón `Probar en mi Avatar`.
- La exportación del avatar usa `GLTFExporter` y descarga un archivo `.glb`.
- Prohibido implementar carga de modelos `.GLB` por parte del usuario.
- Tras generar el modelo, la vista se desplaza suavemente hasta el visor 3D.
- El Navbar muestra `Hola, {nombre}` (nunca el correo) y "Mi Espacio de Medición" repite el nombre.
- La vinculación de tiendas no requiere sesión de Trender: simula la redirección externa (1.5 s) y persiste "Conectada" en `trender.stores`.

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
5. Rate limit de **30 requests / 15 minutos / IP** en `/api/auth`.
6. **Nunca confiar en `req.body`:** validar con `express-validator` en la ruta antes del controlador.
7. Fallo de validación → **400** con array `{ field, message }`; el controlador no se ejecuta.
8. Contraseñas con hash `scrypt` y salt aleatorio; comparación con `timingSafeEqual`.
9. JWT firmado con `JWT_SECRET`; en producción el secreto es obligatorio.
10. `.env` nunca se commitea. Sin secretos ni tokens en logs.

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

- `POST /solicitar-codigo`: demora 1 s y responde 200.
- `POST /verificar-codigo`: solo `123456`; éxito 200 con `token` y `user`; incorrecto 401.
- `POST /registro`: `nombre` obligatorio (1 a 80 caracteres), email y contraseña de 8 a 128 caracteres; 201 con JWT.
- `POST /login`: email y contraseña; 200 con JWT; credenciales inválidas 401.
- `GET /me`: requiere `Authorization: Bearer <token>`; 401 sin token o token inválido; devuelve `user.nombre`.
- Google OAuth está prohibido; la única vía es OTP y contraseña.
- Usuarios clásicos persistidos en la tabla `users` de SQLite con `nombre TEXT NOT NULL`.
- `JWT_SECRET` en `.env.example`; nunca hardcodear el secreto en producción.

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
- `tests/webhooks.test.js`: éxito 200, validación 400 y rutas inexistentes.
- `tests/auth.test.js`: OTP, registro con nombre, login y `/me`.
- `tests/servicios.test.js`: `db.service.js`, `auth.service.js` y `email.service.js`.

### Frontend
```bash
cd frontend
npm test -- --watch=false
npm run build
```

Toda nueva ruta backend requiere prueba en `webhooks.test.js` o `auth.test.js`. Todo nuevo servicio backend requiere prueba en `servicios.test.js`. Todo flujo frontend relevante requiere prueba en el spec del componente o del servicio.

---

## Checklist pre-commit

- [ ] ¿Lógica en servicios y controladores delgados?
- [ ] ¿Validación en la ruta antes del controlador?
- [ ] ¿Rate limit en `/webhooks` y `/api/auth`?
- [ ] ¿Helmet + CORS + Morgan en `src/app.js`?
- [ ] ¿404 antes del error handler y error handler al final?
- [ ] ¿Frontend usa `environment.apiUrl`?
- [ ] ¿Paleta Earth & Studio y SVG en lugar de emojis?
- [ ] ¿Sin “IA” ni “Inteligencia Artificial” en copy, código o documentación?
- [ ] ¿Top-Nav sin sidebar y autenticación centralizada en `AuthService`?
- [ ] ¿Tests backend y frontend actualizados?
- [ ] ¿Sin secretos en código ni logs?
- [ ] ¿`src/index.js` solo arranca el servidor?
