# Alta inicial del Admin en Render Free

El Web Service gratuito no necesita Shell ni un One-Off Job para crear la primera
cuenta. Su comando de arranque ejecuta migraciones y, de forma temporal, un
bootstrap protegido por variables de entorno.

## Activación en el Blueprint existente

Como el Blueprint ya fue creado, Render no volverá a solicitar los secretos
marcados con `sync: false`. Abre el servicio `charros-crm-api-staging`, entra a
**Environment** y agrega manualmente, en el mismo guardado, estas tres variables:

- `BOOTSTRAP_ADMIN_EMAIL`: correo corporativo terminado en
  `@charrosjalisco.com`.
- `BOOTSTRAP_ADMIN_NAME`: nombre visible del único administrador.
- `BOOTSTRAP_ADMIN_PASSWORD`: contraseña temporal de bootstrap, de 14 a 256
  bytes e incluyendo mayúscula, minúscula, número y símbolo.

La contraseña se captura exclusivamente en Render. No debe enviarse por chat,
guardarse en archivos locales ni incluirse en Git.

El arranque se detiene si solo se configura parte del grupo o si la base ya tiene
un estado distinto al único Admin esperado. Si la base está vacía, crea el Admin
en una transacción y luego inicia el API. Si Render reinicia antes de retirar las
variables, reconoce el mismo Admin y continúa sin recalcular ni cambiar su
contraseña.

## Retiro inmediato

Cuando el log muestre `Startup administrator created` y `/ready` responda:

1. Abre el servicio `charros-crm-api-staging` en Render.
2. En **Environment**, elimina las tres variables `BOOTSTRAP_ADMIN_*`.
3. Guarda los cambios y permite que Render reinicie el servicio.
4. Verifica `/ready` y el inicio de sesión desde Vercel.

Con las tres variables ausentes, el bootstrap queda deshabilitado. Un futuro
cambio de contraseña se hace con el procedimiento explícito de reset, nunca por
el arranque normal.
