# Acceso y roles

## Administrador

- Consulta Resumen y Abonados.
- Importa reportes de asistencia.
- Registra y corrige entregas.
- Administra cuentas mediante procedimientos de Render; las contraseñas no se almacenan en Git.

## Consulta

- Ingresa directamente a Abonados.
- Busca por nombre, correo, teléfono, orden o ubicación.
- Filtra por uno o varios segmentos y por hitos entregados.
- Registra o corrige una entrega con confirmación.
- No puede importar archivos ni acceder a funciones administrativas.

## Sesiones

- En producción, cookie de sesión `HttpOnly`, `Secure`, con prefijo `__Host-` y protección CSRF.
- En desarrollo HTTP se usan nombres locales sin `__Host-`; nunca se reutilizan en producción.
- Vigencia absoluta: 8 horas.
- Cierre por inactividad: 45 minutos.
- Logout revoca la sesión en PostgreSQL y elimina las cookies del navegador.
- Toda contraseña temporal obliga a crear una definitiva de al menos 12 caracteres.

Las cuentas operativas aprobadas son Carlos Moreno (administrador), César Carrasco, Mariette Dueñas y Esmeralda Ruvalcaba (consulta). Los correos se normalizan a minúsculas.
