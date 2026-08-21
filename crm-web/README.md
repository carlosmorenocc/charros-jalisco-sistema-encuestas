# CRM Abonados · Charros de Jalisco

SPA privada React/Vite para seguimiento de cartera, renovaciones, prospectos, tareas y ventas LMP 2026–2027. No contiene Excel, CSV ni información personal en el repositorio.

## Funciones incluidas

- Reporte Dirección con métricas filtrables y PDF ejecutivo.
- Cartera y Prospectos con búsqueda, filtros servidor, orden, paginación, alta, edición, baja lógica y restauración según permisos.
- Seguimiento con tareas, bitácora, vencidos y contactos sin asignar.
- Ventas en modo consulta.
- Vistas preparadas —sin acciones falsas— para campañas, recompensas, importaciones y catálogos.

La administración de cuentas no se expone en esta SPA. El acceso local administrativo se provisiona y opera desde los controles seguros del backend.

## Inicio local

Requiere Node.js 20.19+ o 22.12+.

```bash
npm install
copy .env.example .env.local
npm run dev
```

El frontend abre en `http://localhost:5174`; por defecto el API local está en `http://localhost:4100/api/v1`.

```bash
npm test
npm run build
npm run preview
```

## Autenticación local

`VITE_AUTH_MODE` admite:

- `local`: correo y contraseña contra el API.
- `demo`: fixtures 100% sintéticos, solo en desarrollo. El build productivo rechaza este modo.

El navegador no recibe tokens bearer ni guarda credenciales, sesión, CSRF o PII en `localStorage`/`sessionStorage`. El API mantiene la sesión en cookie `HttpOnly`, `Secure`, `SameSite=Strict`; el CSRF devuelto por login/session vive únicamente en memoria. Todas las solicitudes usan `credentials: include` y cada mutación agrega `X-CSRF-Token`.

Rutas de sesión:

| Método | Ruta | Uso |
|---|---|---|
| POST | `/auth/login` | Inicia sesión con `{email,password}`; no requiere CSRF |
| GET | `/auth/session` | Revalida sesión y entrega usuario, permisos, CSRF y vencimientos |
| POST | `/auth/logout` | Revoca sesión; requiere CSRF |

Un `401` posterior al arranque limpia inmediatamente usuario, contactos, tareas, interacciones, ventas, ejecutivos, dashboard, drawers y demás estado privado; después vuelve al login. El temporizador cliente acompaña el vencimiento por inactividad del servidor. La primera visita sin cookie se trata como sesión cerrada normal.

## API CRM

El cliente usa envelopes `{data,meta,error}` y consume, entre otras:

- `/dashboard/summary`
- `/contacts`, `/contacts/:id`, interacciones, tareas y membresías del contacto
- `/interactions`, `/tasks`, `/sales`, `/executives`
- `/exports/contacts.csv`
- `/exports/dashboard-pdf-events`

Las mutaciones concurrentes envían `If-Match`. Los listados de cartera y prospectos usan filtros, orden y paginación del servidor; `meta.total` es la fuente de conteos.

### PDF ejecutivo

Antes de generar o entregar el PDF, la SPA registra `dashboard.pdf_requested` mediante `/exports/dashboard-pdf-events`, con solo temporada, ejecutivo y límites ISO del periodo. Si esa validación/auditoría falla, no hay descarga. El PDF se genera localmente y excluye nombres, correos, teléfonos, notas y filas operativas.

En desarrollo demo el archivo lleva prefijo `demo-` y las marcas `DATOS SINTÉTICOS · NO USAR PARA DECISIONES`; producción nunca empaqueta fixtures demo.

## Despliegue Vercel

- Root Directory: `crm-web`
- Build Command: `npm run build`
- Output Directory: `dist`
- `VITE_AUTH_MODE=local`
- `VITE_API_BASE_URL=/api/v1` (o se puede omitir; ese es el valor productivo seguro)

`vercel.json` reescribe primero `/api/v1/:path*` hacia el API staging de Render y después aplica el fallback SPA. Las respuestas API llevan `no-store`; la CSP limita conexiones a `self`, bloquea iframes y la aplicación se marca `noindex`.

Antes de liberar: probar login, logout, expiración/idle, un `401` durante navegación, una mutación CSRF, exportación autorizada y el bloqueo de PDF si falla su evento de auditoría.

## Controles de datos

- Nunca incorporar Excel, CSV, tokens, contraseñas, cookies, PII exportada o respaldos al frontend.
- Demo solo usa dominios `example.invalid`/`example.com` y no aparece en `dist` productivo.
- Exportar, eliminar y restaurar dependen de permisos efectivos del API.
- La baja es lógica, exige motivo y conserva auditoría.
- `public/charros-logo.jpeg` es el asset autorizado del equipo.
