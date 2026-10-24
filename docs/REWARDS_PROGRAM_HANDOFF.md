# Programa de Recompensas Club Charros LMP 2026–27

## Estado de esta entrega

Implementación local en la rama `feat/programa-recompensas-lmp-26-27`. No se publicó, no se ejecutó la migración en producción y no se cargaron archivos personales en una base de datos.

La interfaz puede revisarse en desarrollo con:

```bash
cd crm-web
npm run dev
```

Abrir `http://localhost:5174/?rewards-preview=1` para el recorrido sintético. Este acceso sólo existe en modo de desarrollo.

## Arquitectura verificada

- `crm-web`: React/Vite. Contiene la operación, buscador, filtros, perfil por butaca, 15 hitos, confirmación de cupón y asistente de importación.
- `crm-api`: Node/Express/PostgreSQL. Contiene el aislamiento de permisos, repositorio y tablas del programa.
- `crm-import`: ExcelJS y controles de promoción ya existentes. Se mantuvo independiente; el parser de recompensas vive en `crm-api/src/lib/rewardWorkbook.js` para no mezclar el padrón del programa con el CRM.
- La identidad de una butaca se forma con orden, zona, sección y asiento normalizados. Cada butaca conserva contador, asistencias, cupones, transferencias y correcciones propios.

## Seguridad y aislamiento

Se agregó el rol `rewards_operator` con sólo:

- `rewards.read`
- `rewards.coupon.deliver`

No recibe permisos de contactos, ventas, tareas, importaciones, exportaciones ni administración del CRM. Al iniciar sesión, este rol abre directamente el módulo de recompensas y no solicita el dashboard del CRM. La carga y administración futura requieren permisos separados: `rewards.import`, `rewards.admin` y `rewards.export`.

La migración `029_rewards_program.sql` crea tablas independientes para programa, partidos, lotes, asistencias, definiciones de recompensa, entregas, transferencias y correcciones. Las restricciones evitan duplicar una asistencia por butaca/partido y una entrega activa por butaca/recompensa.

## Reglas implementadas en el adaptador Excel

- El reporte de órdenes sólo acepta `TIPO = Abono` y productos elegibles definidos de forma explícita.
- Cortesía de abono, Compromisos, suites y patrocinadores se excluyen con causa.
- Casos ambiguos pasan a revisión; no se fuerzan.
- Precios de $0/$1 y colaboradores no se excluyen automáticamente, pero quedan señalados para revisión comercial.
- Los accesos se deduplican por partido y butaca; el nombre del archivo no decide el partido.
- Un corte parcial puede coexistir con otro corte del mismo partido sin incrementar dos veces una misma asistencia.

## Resultado del diagnóstico de los archivos entregados

El conteo estricto actual no coincide todavía con toda la referencia operativa:

| Fuente | Aceptados con reglas estrictas | Referencia esperada |
|---|---:|---:|
| Órdenes detalladas | 606 programas | 616 programas |
| Accesos 13 oct | 500 | 504 |
| Accesos 20 oct | 379 | 387 |
| Accesos 21 oct | 303 | 307 |
| Accesos 22 oct | 429 | 429 |

No se alteraron reglas para forzar los totales. Antes de una carga real se necesita resolver los productos/promociones y casos comerciales que explican esas diferencias.

## Repositorios y traslado institucional

Verificado:

- Sólo existe el remoto `origin`.
- `origin` apunta al repositorio personal `carlosmorenocc/charros-jalisco-sistema-encuestas`.
- No hay remoto institucional ni configuración local que pruebe un espejo automático.

Pendiente de configuración institucional:

1. Crear o identificar el repositorio institucional.
2. Agregar un remoto con acceso de mínimo privilegio.
3. Definir protección de ramas y responsables de aprobación.
4. Probar una transferencia mediante pull request; no asumir sincronización automática.
5. Validar infraestructura Windows/PostgreSQL, backups, restauración y custodia de credenciales.

## Validación ejecutada

- `crm-web`: 85 pruebas aprobadas y build de producción correcto.
- `crm-api`: 120 pruebas aprobadas y chequeo estático correcto.
- `crm-import`: 25 pruebas aprobadas.
- Verificación visual local a 1366×768 y 1920×1080 con datos sintéticos.
- Estados expresan icono y texto, hay foco visible, salto al contenido y soporte para movimiento reducido.

Capturas:

- `docs/screenshots/rewards-operation-1366x768.png`
- `docs/screenshots/rewards-operation-1920x1080.png`

## Barreras antes de producción

- Conciliar los conteos anteriores con responsables del programa.
- Probar la migración y restauración en una PostgreSQL de staging institucional.
- Completar endpoints de previsualización/confirmación para carga real, transferencias, correcciones y exportación administrativa. La interfaz de carga actual es el flujo sintético solicitado; aún no escribe archivos reales.
- Probar perfiles y canjes con datos sintéticos sembrados en staging y con una cuenta `rewards_operator` real.
- Confirmar política pendiente sobre cuentas corporativas, colaboradores y casos $0/$1.
- Revisar los `.xlsx` históricos actualmente versionados bajo `crm-import/input`: contienen datos operativos y requieren una decisión explícita de saneamiento del historial Git. No se modificaron ni eliminaron en esta entrega.
- Obtener autorización concreta antes de ejecutar migraciones, subir datos o desplegar.

