# Modelo de datos

La base es PostgreSQL independiente del CRM. Todas las tablas del módulo usan el prefijo `rewards_`.

| Tabla | Propósito | Invariante principal |
|---|---|---|
| `rewards_users` | Administrador y cuentas de consulta | Correo único; contraseña derivada con scrypt; cambio inicial obligatorio |
| `rewards_sessions` | Sesiones revocables | Tokens almacenados como digest; expiración absoluta e inactiva |
| `rewards_seasons` | Configuración de temporada | 34 juegos regulares para `LMP-2026-27` |
| `rewards_holders` | Titulares normalizados | Una identidad operativa puede tener varias órdenes y butacas |
| `rewards_orders` | Compra y metadatos comerciales | Orden única por temporada; enlaza todas sus butacas |
| `rewards_programs` | Una fila por abono/butaca | Única por temporada + orden + zona + sección + asiento; conserva segmento, datos del titular y una excepción de elegibilidad opcional de lista cerrada |
| `rewards_program_aliases` | Llaves históricas de acceso | Una llave anterior apunta de forma explícita a un solo programa vigente |
| `rewards_games` | Calendario local | Fecha y secuencia únicas; estado programado, parcial o cerrado |
| `rewards_imports` | Trazabilidad de archivos | SHA-256 único; evita importar dos veces el mismo archivo |
| `rewards_attendance` | Asistencia conciliada | Única por programa + juego |
| `rewards_catalog` | Hitos pares del 2 al 30 | Beneficio y tipo directo/sorteo |
| `rewards_deliveries` | Entregas, destinatarios y reversiones | Solo una entrega no revertida por programa + hito; cada nueva entrega conserva destinatario, fecha y actor |
| `rewards_audit` | Bitácora interna | Registra importaciones, entregas y correcciones; no necesita vista pública |

La identidad operativa no se deduplica por correo o teléfono porque un comprador puede controlar varias butacas y familiares pueden compartir datos de contacto.

### Historial de entregas

Cada fila de `rewards_deliveries` pertenece a una butaca/programa y a un hito. `recipient_name` identifica a quien recibió físicamente el beneficio; no sustituye al titular ni modifica la identidad del programa. Para toda nueva entrega es obligatorio, se normaliza antes de persistirlo y la fecha de entrega se genera en el servidor.

Las filas históricas creadas antes de incorporar este dato pueden conservar `recipient_name = NULL`: la interfaz las presenta como “Destinatario no registrado” y nunca infiere que el titular fue quien recibió. Una reversión marca la fila original, conserva sus datos y permite crear una nueva entrega corregida. El estado activo de los círculos considera únicamente la entrega no revertida; el historial incluye ambas.

Las correcciones verificadas con Boleto Móvil conservan el `id` y `permanent_key` del programa cuando solo cambia su dato comercial. Si una butaca fue reasignada y ya registró accesos con una orden anterior, la llave anterior se guarda en `rewards_program_aliases`; las asistencias nuevas e históricas terminan en el mismo `program_id` y, por tanto, en un solo contador de recompensas.

### Excepción de elegibilidad del programa

`rewards_programs.eligibility_exception` es nullable. Su dominio está restringido por la base de datos y actualmente solo admite `authorized_giveaway_courtesy`; `NULL` representa el comportamiento ordinario. El campo pertenece al programa/butaca, no al titular ni a toda la orden, para impedir que la autorización se propague a otros asientos.

La presencia del valor no basta para contar una asistencia. El importador exige además coincidencia exacta de la llave comercial y valida tipo, producto, patrocinio y ausencia de suite. Por ello, aliases y estrategias de conciliación de respaldo no heredan la excepción. El alta o cambio de este campo se realiza únicamente mediante el procedimiento transaccional documentado en `OPERATIONS.md`, con trazabilidad no personal.
