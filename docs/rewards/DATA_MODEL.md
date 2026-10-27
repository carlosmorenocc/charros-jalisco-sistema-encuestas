# Modelo de datos

La base es PostgreSQL independiente del CRM. Todas las tablas del módulo usan el prefijo `rewards_`.

| Tabla | Propósito | Invariante principal |
|---|---|---|
| `rewards_users` | Administrador y cuentas de consulta | Correo único; contraseña derivada con scrypt; cambio inicial obligatorio |
| `rewards_sessions` | Sesiones revocables | Tokens almacenados como digest; expiración absoluta e inactiva |
| `rewards_seasons` | Configuración de temporada | 34 juegos regulares para `LMP-2026-27` |
| `rewards_programs` | Una fila por abono/butaca | Única por temporada + orden + zona + sección + asiento; conserva segmento y datos del titular |
| `rewards_games` | Calendario local | Fecha y secuencia únicas; estado programado, parcial o cerrado |
| `rewards_imports` | Trazabilidad de archivos | SHA-256 único; evita importar dos veces el mismo archivo |
| `rewards_attendance` | Asistencia conciliada | Única por programa + juego |
| `rewards_catalog` | Hitos pares del 2 al 30 | Beneficio y tipo directo/sorteo |
| `rewards_deliveries` | Entregas y reversiones | Solo una entrega no revertida por programa + hito |
| `rewards_audit` | Bitácora interna | Registra importaciones, entregas y correcciones; no necesita vista pública |

La identidad operativa no se deduplica por correo o teléfono porque un comprador puede controlar varias butacas y familiares pueden compartir datos de contacto.
