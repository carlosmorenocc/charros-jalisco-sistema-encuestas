# CRM Abonados API

API privada del CRM de Abonados Charros LMP 2026-2027. Está aislada del API de registros públicos y no contiene datos, contraseñas ni secretos reales.

Esta entrega tiene **una sola cuenta autenticable**, con rol `admin`. No requiere Microsoft Entra ni una suscripción de Microsoft. Las rutas para crear, editar o conceder permisos a otros usuarios fueron retiradas.

## Modelo y alcance

- Una persona es un `contact`; sus temporadas están en `memberships` y cada asiento/abono en `membership_units`.
- `memberships.section` clasifica comercialmente como `VIP`, `Preferente` o `General`; `zone` conserva sin cambios la zona histórica detallada.
- Solo `interactions.is_human_contact=true` actualiza el último contacto humano.
- Los envíos masivos nunca cuentan como contacto humano.
- Contactos, tareas, abonos y ventas usan soft delete cuando aplica.
- Ediciones concurrentes usan ETag e `If-Match`.
- Ventas y pagos son de solo lectura en esta entrega.

## Autenticación local

El navegador accede al API por el mismo host de Vercel, mediante un rewrite de `/api/v1/*` hacia Render. No debe llamar directamente al dominio `onrender.com`. Así, las cookies siguen siendo first-party y no dependen de cookies de terceros.

Controles aplicados:

- contraseña con scrypt `N=32768,r=8,p=3`, salt aleatorio y `PASSWORD_PEPPER` externo;
- hash guardado en `local_credentials`, separado de `app_users`;
- sesión opaca aleatoria de 32 bytes; PostgreSQL conserva solamente su HMAC;
- cookie de producción `__Host-crm_session`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/` y sin `Domain`;
- CSRF aleatorio con HMAC en PostgreSQL, cookie `__Host-crm_csrf` y encabezado `X-CSRF-Token`, comparados en tiempo constante;
- origen HTTPS exacto en cada login y mutación;
- expiración absoluta de 8 horas e inactividad de 45 minutos;
- cada login nuevo revoca cualquier sesión anterior del único Admin;
- límite persistente y bloqueo temporal por red, más un máximo de dos verificaciones scrypt simultáneas por proceso;
- deliberadamente no existe bloqueo global por correo: evita que un tercero mantenga inhabilitada la única cuenta Admin;
- login, logout, bootstrap y reset quedan auditados sin correo, IP cruda, contraseña, cookie ni token;
- logs sin cuerpos, query strings, cookies ni encabezados de autenticación.

Los secretos `AUDIT_HASH_KEY`, `SESSION_HASH_KEY` y `PASSWORD_PEPPER` deben ser diferentes, aleatorios y tener al menos 32 caracteres en producción. No deben cambiarse sin un procedimiento de rotación; cambiar `PASSWORD_PEPPER` invalida la contraseña y cambiar `SESSION_HASH_KEY` invalida las sesiones.

## Instalación local

Requiere Node.js 20+ y PostgreSQL 15+.

```powershell
Copy-Item .env.example .env
npm ci
npm run migrate
npm run bootstrap:admin
npm run dev
```

Antes de `bootstrap:admin`, define temporalmente:

- `BOOTSTRAP_ADMIN_EMAIL`: correo corporativo `@charrosjalisco.com`;
- `BOOTSTRAP_ADMIN_NAME`: nombre visible;
- `BOOTSTRAP_ADMIN_PASSWORD`: 14–256 bytes, con mayúscula, minúscula, número y símbolo.

El bootstrap exige que `app_users` no tenga registros activos/no eliminados y crea la única cuenta Admin. Retira `BOOTSTRAP_ADMIN_PASSWORD` del entorno inmediatamente después.

Para restablecer la contraseña del único Admin:

```powershell
npm run reset:admin
```

El reset exige el correo exacto en `BOOTSTRAP_ADMIN_EMAIL`, actualiza el hash y revoca todas las sesiones existentes.

## Contrato de sesión

Base del navegador: `/api/v1`. Todas las llamadas usan `credentials: "include"`. No se usa `Authorization`, MSAL, Bearer ni almacenamiento web.

### Login

```http
POST /api/v1/auth/login
Origin: https://<host-vercel-exacto>
Content-Type: application/json

{"email":"admin@charrosjalisco.com","password":"<contraseña>"}
```

Respuesta `200`:

```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "admin@charrosjalisco.com",
      "displayName": "Administrador CRM",
      "role": "admin",
      "permissions": ["dashboard.read"]
    },
    "csrfToken": "token-opaco",
    "expiresAt": "2026-08-21T23:00:00.000Z",
    "idleExpiresAt": "2026-08-21T15:45:00.000Z"
  }
}
```

El login requiere origen exacto pero no CSRF porque aún no existe sesión. Error genérico `401` para credenciales incorrectas y `429` al exceder límites.

### Recuperar sesión

`GET /api/v1/auth/session` devuelve la misma forma de `data`. Conserva el CSRF actual para no romper pestañas concurrentes y solo lo repone si falta su cookie. Responde `401` si la sesión no existe o expiró.

### Mutaciones y logout

Toda ruta `POST`, `PATCH`, `PUT` o `DELETE` autenticada requiere:

```http
Origin: https://<host-vercel-exacto>
X-CSRF-Token: <csrfToken>
```

`POST /api/v1/auth/logout` responde `204`, revoca la sesión en PostgreSQL y elimina ambas cookies.

## Rutas funcionales

| Método | Ruta | Uso |
|---|---|---|
| GET | `/health`, `/ready` | Liveness y readiness |
| POST, GET, POST | `/api/v1/auth/login`, `/session`, `/logout` | Sesión local |
| GET | `/api/v1/me` | Admin y permisos efectivos |
| GET | `/api/v1/dashboard/summary` | KPIs ejecutivos |
| POST | `/api/v1/manual-registrations` | Alta manual atómica e idempotente, solo Admin |
| GET, POST | `/api/v1/contacts` | Listar/crear contactos |
| GET, PATCH, DELETE | `/api/v1/contacts/:id` | Detalle, edición y soft delete |
| POST | `/api/v1/contacts/:id/restore` | Restaurar |
| GET, POST | `/api/v1/contacts/:id/interactions` | Actividad |
| GET, POST | `/api/v1/contacts/:id/tasks` | Tareas del contacto |
| GET, PATCH | `/api/v1/tasks`, `/api/v1/tasks/:id` | Operación diaria |
| GET, POST | `/api/v1/contacts/:id/memberships` | Abonos y unidades |
| PATCH | `/api/v1/memberships/:id` | Sección, cantidad y butacas con `If-Match` |
| GET | `/api/v1/pricing/subscriptions/catalog` | Localidades y promociones vigentes |
| GET | `/api/v1/pricing/subscriptions/quote` | Cotización autoritativa por localidad, promoción y cantidad |
| GET | `/api/v1/sales`, `/api/v1/sales/:id` | Ventas de solo lectura |
| GET | `/api/v1/executives?active=true` | Selector mínimo |
| GET | `/api/v1/exports/contacts.csv` | Exportación auditada |
| POST | `/api/v1/exports/dashboard-pdf-events` | Autoriza/audita solicitud de PDF |
| GET | `/api/v1/audit` | Auditoría minimizada |

No existen rutas `/api/v1/users` ni mutaciones de usuarios/permisos.

Los perfiles Esmeralda, Jesús, Rosana, EN LINEA, Pascual y Cesar existen únicamente
para asignación de cartera. No tienen credencial local y no pueden iniciar sesión.

La edición de butacas exige una unidad secuencial por cada abono, identificadores
únicos y `If-Match` con la versión de la membresía. El servidor conserva los IDs de
las unidades importadas, evita asignar la misma butaca activa/por renovar dentro de
la misma temporada y sección, y devuelve un nuevo `ETag` después de guardar.

Los importes se calculan en el servidor y la membresía conserva una fotografía del
catálogo aplicado. `commercialValue` es el valor comercial antes de promoción;
`netAmount` es el importe neto después del descuento. Ninguno equivale a cobrado
ni a utilidad; los cobros sólo provienen de `payments`.

### Alta manual

`POST /api/v1/manual-registrations` exige la sesión Admin, protección CSRF y un
`Idempotency-Key` UUID nuevo. Crea en una sola transacción el contacto, su
consentimiento, asignación, abono/unidades cuando corresponde, observación inicial y
la siguiente tarea opcional. La observación se conserva como actividad no humana y
no modifica la fecha de último contacto humano.

```http
POST /api/v1/manual-registrations
Origin: https://<host-vercel-exacto>
X-CSRF-Token: <csrfToken>
Idempotency-Key: <crypto.randomUUID()>
Content-Type: application/json
```

```json
{
  "contact": {
    "firstName": "Ana",
    "lastName": "López",
    "email": "ana@example.com",
    "phone": "+523312345678",
    "municipality": "Guadalajara",
    "subscriberStatus": "renewing",
    "commercialStage": "follow_up",
    "preferredChannel": "whatsapp",
    "executiveId": null,
    "businessSource": "season_ticket_database",
    "declaredTenureSeasons": 3
  },
  "consent": { "status": "yes" },
  "initialObservation": { "notes": "Alta capturada por Administración." },
  "membership": {
    "seatCount": 2,
    "renewalDate": "2026-08-21T18:00:00.000Z",
    "units": [
      { "unitNumber": 1, "jerseySize": "M" },
      { "unitNumber": 2, "jerseySize": null }
    ]
  },
  "nextTask": {
    "assignedTo": "uuid-opcional",
    "description": "Confirmar datos",
    "dueAt": "2026-08-22T18:00:00.000Z",
    "priority": "normal"
  }
}
```

Reglas del comando:

- `businessSource` es obligatorio y admite `season_ticket_database`, `referral`,
  `box_office`, `digital`, `event`, `outbound` u `other`; `source=crm_manual` se
  deriva aparte en el servidor como procedencia técnica.
- `phone` se guarda en la misma forma canónica de 10 dígitos que usa el importador;
  las variantes nacionales, `+52` y el prefijo histórico `521` se consideran la
  misma identidad para el bloqueo concurrente y el dedupe de contactos/aliases.
- `declaredTenureSeasons` es opcional (`null` significa que no consta) y no crea
  historial ficticio. `seasonsCount` continúa siendo el conteo de membresías
  realmente registradas.
- `prospect` no lleva `membership`. Los demás estados crean la temporada fija
  `LMP-2026-27`: `current_subscriber` y `new_subscriber` como `active`, `renewing`
  como `renewing`, y `former_subscriber` como `expired`.
- Un abono `active` exige `startDate`; uno `renewing` exige `renewalDate`.
- `seatCount` admite 1–20 y `units` debe contener exactamente la secuencia
  `1..seatCount`. `jerseySize` es opcional (`null`) o `S`, `M`, `L`, `XL`, `2XL`.
- El cliente solo envía `consent.status`: `yes`, `no` o `unknown`. Para `yes/no`,
  el servidor fija la versión real del aviso `2026-08-01`; para `unknown` la deja
  en `null`. El cliente no puede declarar una versión legal.
- `nextTask` es opcional, su fecha debe ser futura y el responsable debe estar
  activo y ser coherente con la cartera asignada.

Una creación responde `201`; el replay de la misma llave y cuerpo responde `200`
sin repetir escrituras ni auditoría. Ambas respuestas exponen `ETag`,
`Idempotency-Replayed` y:

```json
{
  "data": {
    "contact": {},
    "membership": {},
    "initialInteraction": {},
    "nextTask": {},
    "replayed": false
  }
}
```

El mismo `Idempotency-Key` con otro cuerpo devuelve `409 CONFLICT`. Un correo o
teléfono ya presente en el contacto principal o sus aliases devuelve
`409 DUPLICATE_CONTACT` y `error.details.matches` con elementos
`{"id":"uuid","deleted":false}`; nunca fusiona automáticamente. En la vista de
contactos, `seatCount` conserva el KPI de abonos activos y `managedSeatCount`
incluye activos más renovaciones en seguimiento.

El evento de PDF acepta exclusivamente:

```json
{
  "filters": {
    "season": "LMP-2026-27",
    "executiveId": "uuid-opcional",
    "from": "2026-08-01T00:00:00.000Z",
    "to": "2026-08-21T23:59:59.999Z"
  }
}
```

Todos los filtros son opcionales. Responde `204` y registra `dashboard.pdf_requested` con hora del servidor, sin métricas, nombres ni PII. El frontend genera/entrega el PDF únicamente después del `204`.

## Pruebas y despliegue

```powershell
npm test
npm run check
npm audit
```

En producción:

- usar el Internal Database URL de Render;
- configurar los tres secretos en Render;
- fijar `CORS_ORIGINS` al host HTTPS exacto de Vercel;
- mantener el rewrite same-origin antes del fallback SPA;
- ejecutar migraciones antes de iniciar;
- probar en staging los flags reales de cookie, login/session/logout, CSRF, origen ajeno y sesión expirada;
- conservar backups/PITR acordes al plan contratado.
