# Checklist de despliegue privado del CRM

La primera entrega usa un único Administrador local. No requiere Microsoft Entra,
una cuenta Microsoft ni una prueba gratuita de identidad. Vercel aloja la interfaz
y reenvía `/api/v1` al API de Render; Render aloja el API y PostgreSQL.

## 1. Publicar el código

- Mantener la rama `feat/crm-abonados-lmp-26-27` hasta aprobar staging.
- Los checks de API, web e importador deben estar verdes antes del despliegue.
- No subir el Excel original, exportaciones, `.env` ni contraseñas.

## 2. Crear staging en Render

Usar el Blueprint `render.yaml` de la raíz. Crea:

- `charros-crm-api-staging`, con Root Directory `crm-api`;
- `charros-crm-db-staging`, PostgreSQL en la misma región y sin acceso externo.

El API usa la URL interna, `DATABASE_SSL=false`, migraciones en pre-deploy y
`/ready` como health check. Los planes definidos en el Blueprint son recursos de
Render y pueden generar costo; quitar Entra evita un proveedor adicional, no el
costo de una base persistente y respaldada.

Configurar en Render:

- `CORS_ORIGINS=https://<dominio-exacto-del-crm-en-vercel>`;
- `AUDIT_HASH_KEY`, `SESSION_HASH_KEY` y `PASSWORD_PEPPER`: tres secretos
  diferentes, aleatorios y de al menos 32 caracteres;
- `LOCAL_ADMIN_DOMAIN=charrosjalisco.com`;
- `SESSION_COOKIE_SECURE=true`.

Los tres secretos pueden ser generados por Render mediante el Blueprint. No se
copian a Vercel ni se comparten por chat.

## 3. Crear la única cuenta Administrador

Después de que las migraciones terminen, configurar temporalmente en Render:

- `BOOTSTRAP_ADMIN_EMAIL`: correo corporativo del Administrador;
- `BOOTSTRAP_ADMIN_NAME`: nombre visible;
- `BOOTSTRAP_ADMIN_PASSWORD`: contraseña única de 14–256 bytes, con mayúscula,
  minúscula, número y símbolo.

Ejecutar dentro del servicio:

```powershell
npm run bootstrap:admin
```

Eliminar inmediatamente `BOOTSTRAP_ADMIN_PASSWORD` y las demás variables
`BOOTSTRAP_ADMIN_*`. El comando se rechaza si ya existe una cuenta activa.

Para cambiar la contraseña, volver a definir temporalmente esas variables y usar:

```powershell
npm run reset:admin
```

El reset revoca todas las sesiones existentes. La contraseña nunca se envía por
chat ni se guarda en documentación.

## 4. Publicar la interfaz en Vercel

Crear un proyecto independiente conectado al mismo repositorio:

- Root Directory: `crm-web`;
- Framework: Vite;
- Build Command: `npm run build`;
- Output Directory: `dist`;
- `VITE_AUTH_MODE=local`;
- `VITE_API_BASE_URL=/api/v1` o sin definir, pues ese es el valor seguro.

`crm-web/vercel.json` contiene el rewrite same-origin hacia Render antes del
fallback de la SPA. El navegador nunca llama directamente a `onrender.com`, no
recibe secretos y no depende de cookies de terceros.

Cuando Vercel entregue el dominio definitivo, copiarlo exactamente a
`CORS_ORIGINS` en Render y redesplegar el API.

## 5. Pruebas antes de importar datos reales

- Primera visita muestra login sin un falso aviso de sesión expirada.
- Credenciales incorrectas devuelven un error genérico y el límite responde `429`.
- Login crea cookies `__Host-`, `Secure`, `HttpOnly`, `SameSite=Strict`.
- Sin sesión, todos los endpoints privados responden `401`.
- Mutación sin CSRF o desde otro origen es rechazada.
- Logout exitoso revoca la sesión; una falla de red no debe simular que la revocó.
- Al expirar la sesión, la SPA borra la información cargada y vuelve al login.
- El PDF muestra solo agregados y se audita como `dashboard.pdf_requested`.
- Contactos, tareas, bajas y restauraciones generan auditoría.
- `/ready` valida API y PostgreSQL.
- Existe una prueba documentada de respaldo y restauración.

## 6. Importación

El dry-run puede ejecutarse localmente y nunca modifica el Excel. El commit a
staging debe ejecutarse como job dentro de la red privada de Render o mediante un
acceso temporal limitado a una IP exacta y retirado de inmediato. Nunca abrir
`0.0.0.0/0`, importar directamente a producción ni cargar datos reales antes de
aprobar cuarentenas, consentimientos y candidatos de fusión.
