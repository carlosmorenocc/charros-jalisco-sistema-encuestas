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
| `rewards_catalog` | Hitos pares del 2 al 30 | Beneficio, tipo directo/sorteo y desplazamiento de entrega |
| `rewards_deliveries` | Versiones de entrega, destinatarios y reversiones | Solo una entrega no revertida por programa + hito; cada versión conserva destinatario, fecha, actor e idempotencia |
| `rewards_audit` | Bitácora interna | Registra importaciones, entregas y correcciones; no necesita vista pública |

La identidad operativa no se deduplica por correo o teléfono porque un comprador puede controlar varias butacas y familiares pueden compartir datos de contacto.

### Historial de entregas

Cada fila de `rewards_deliveries` pertenece a una butaca/programa y a un hito. `recipient_name` identifica a quien recibió físicamente el beneficio; no sustituye al titular ni modifica la identidad del programa. Para toda nueva entrega es obligatorio, se normaliza antes de persistirlo y la fecha de entrega se genera en el servidor.

Las filas históricas creadas antes de incorporar este dato pueden conservar `recipient_name = NULL`: la interfaz las presenta como “Destinatario no registrado” y nunca infiere que el titular fue quien recibió. Una reversión marca la fila original, conserva sus datos y permite crear una nueva entrega corregida. El estado activo de los círculos considera únicamente la entrega no revertida.

La API proyecta esas filas como un único estado operativo por hito: prefiere la entrega activa y, si no existe, devuelve la corrección más reciente. Incluye `versionCount` y `correctionCount` para informar que hubo ajustes sin repetir tarjetas en pantalla. Esta proyección no compacta ni elimina filas de PostgreSQL ni entradas de `rewards_audit`.

El índice parcial `rewards_delivery_active_unique` impide más de una entrega activa por programa e hito. Las mutaciones se serializan con el bloqueo del programa y usan precondiciones de versión: `deliveryId` para corregir y `expectedLatestDeliveryId` para entregar. Así, una sesión desactualizada recibe conflicto y nunca modifica una versión que no vio. `idempotency_key` permite recuperar exactamente la misma confirmación sin una segunda inserción; un payload diferente con la misma llave se rechaza.

`rewards_catalog.redeem_from_offset` es la fuente del umbral de entrega. La API valida las asistencias conciliadas del mismo `program_id` contra `milestone + redeem_from_offset`; para la temporada vigente el desplazamiento es `0`, por lo que un hito `N` puede entregarse al alcanzar `N` asistencias. Registrar la entrega no crea asistencia ni adelanta el contador; permite operar durante la siguiente visita física cuando el archivo de ese partido aún no ha sido importado. Un conteo inferior al umbral sigue rechazándose, incluso si el cliente intenta habilitar el control por su cuenta.

Las correcciones verificadas con Boleto Móvil conservan el `id` y `permanent_key` del programa cuando solo cambia su dato comercial. Si una butaca fue reasignada y ya registró accesos con una orden anterior, la llave anterior se guarda en `rewards_program_aliases`; las asistencias nuevas e históricas terminan en el mismo `program_id` y, por tanto, en un solo contador de recompensas.

### Correcciones autoritativas de sección

`rewards_programs.section` es un atributo comercial corregible; la identidad estable de una butaca participante es su `id` y `permanent_key`. Cuando la fuente autoritativa confirma que solo la sección estaba desactualizada, el procedimiento `REWARDS_PROGRAM_SECTION_CORRECTION` conserva programa, titular, orden, zona, asiento y segmento. Antes de escribir coteja el segmento esperado y exige que `order_id` resuelva a `rewards_orders` con la misma temporada y número de orden. Después actualiza la sección y establece `manual_lock = true` para impedir que una carga posterior del padrón restaure el dato obsoleto.

`rewards_attendance`, `rewards_deliveries`, `rewards_transfers` y `rewards_program_aliases` se relacionan por `program_id`; por ello, una corrección de sección no mueve ni recrea asistencias, hitos o entregas. La sección anterior no se convierte en alias porque no representa una ubicación histórica válida. Los aliases se reservan para llaves que sí fueron válidas y deben conservar continuidad entre una identidad histórica y el programa vigente.

La unicidad de `rewards_programs` incluye temporada, orden, zona, sección y asiento. Esa restricción evita una llave comercial exacta dentro de la misma orden, pero no basta para detectar variantes de formato ni que dos órdenes ocupen la misma butaca física. Antes de una corrección por lote se proyectan las nuevas secciones y se exige que no exista otra llave normalizada de la misma orden, incluso si la fila en conflicto está inactiva o excluida. Por separado, se normalizan zona, sección y asiento de los programas activos y elegibles para impedir duplicados físicos entre órdenes. También se comprueba que ningún alias activo con la nueva llave apunte a otro programa, porque la conciliación de asistencias evalúa aliases históricos antes que la coincidencia vigente.

### Excepción de elegibilidad del programa

`rewards_programs.eligibility_exception` es nullable. Su dominio está restringido por la base de datos y actualmente solo admite `authorized_giveaway_courtesy`; `NULL` representa el comportamiento ordinario. El campo pertenece al programa/butaca, no al titular ni a toda la orden, para impedir que la autorización se propague a otros asientos.

La presencia del valor no basta para contar una asistencia. El importador exige además coincidencia exacta de la llave comercial y valida tipo, producto, patrocinio y ausencia de suite. Por ello, aliases y estrategias de conciliación de respaldo no heredan la excepción. El alta o cambio de este campo se realiza únicamente mediante el procedimiento transaccional documentado en `OPERATIONS.md`, con trazabilidad no personal.
