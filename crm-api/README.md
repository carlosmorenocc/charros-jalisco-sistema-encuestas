# CRM Abonados API

API privada del CRM de Abonados Charros LMP 2026-2027. Está aislada del API de registros públicos y no contiene datos, contraseñas ni secretos reales.

Esta entrega tiene **una sola cuenta autenticable**, con rol `admin`. No requiere Microsoft Entra ni una suscripción de Microsoft. Las rutas para crear, editar o conceder permisos a otros usuarios fueron retiradas.

## Modelo y alcance

- Una persona es un `contact`; sus temporadas están en `memberships` y cada asiento/abono en `membership_units`.
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
| GET, POST | `/api/v1/contacts` | Listar/crear contactos |
| GET, PATCH, DELETE | `/api/v1/contacts/:id` | Detalle, edición y soft delete |
| POST | `/api/v1/contacts/:id/restore` | Restaurar |
| GET, POST | `/api/v1/contacts/:id/interactions` | Actividad |
| GET, POST | `/api/v1/contacts/:id/tasks` | Tareas del contacto |
| GET, PATCH | `/api/v1/tasks`, `/api/v1/tasks/:id` | Operación diaria |
| GET, POST | `/api/v1/contacts/:id/memberships` | Abonos y unidades |
| GET | `/api/v1/sales`, `/api/v1/sales/:id` | Ventas de solo lectura |
| GET | `/api/v1/executives?active=true` | Selector mínimo |
| GET | `/api/v1/exports/contacts.csv` | Exportación auditada |
| POST | `/api/v1/exports/dashboard-pdf-events` | Autoriza/audita solicitud de PDF |
| GET | `/api/v1/audit` | Auditoría minimizada |

No existen rutas `/api/v1/users` ni mutaciones de usuarios/permisos.

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
