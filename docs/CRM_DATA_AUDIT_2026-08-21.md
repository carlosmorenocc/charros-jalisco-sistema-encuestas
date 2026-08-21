# Auditoría de datos del CRM de abonados

Fecha del corte: 21 de agosto de 2026.

## Alcance y resguardo

- El libro original se revisó en modo de solo lectura y su huella SHA-256 se
  verificó antes y después del análisis. El archivo no fue modificado.
- Una copia inmutable del libro y los reportes que pueden contener datos
  personales permanecen en `.local-private/` de la raíz privada del workspace,
  fuera de este worktree y de Git. Los reportes agregados del dry-run se guardan
  bajo `crm-import/reports/`, también ignorado por Git, y no contienen PII.
- Este documento contiene únicamente métricas agregadas y reglas de migración;
  no incluye nombres, correos, teléfonos ni observaciones de personas.
- La importación real no se ejecutó. El importador opera en `dry-run` por
  defecto y, aun en staging, no fusiona ni promueve contactos automáticamente.

## Perfil del libro

- 11 hojas visibles y 9 tablas estructuradas.
- Sin macros, vínculos externos, consultas, conexiones, tablas dinámicas,
  errores de fórmula ni hojas ocultas.
- 119,785 celdas con contenido y 15,500 fórmulas.
- Algunas hojas contienen filas de plantilla o fórmulas precargadas. Estas
  filas no deben contarse como registros: por ejemplo, `Abonados` contiene 281
  filas con fórmula de identificador pero sin datos, y `CRM` tiene formato hasta
  la fila 5,000 aunque solo 2,529 filas contienen información.
- Las 14 validaciones de Excel son técnicamente válidas, pero todas impiden
  valores en blanco; la aplicación web aplicará reglas según el estado real del
  flujo, no copiará esa restricción de forma indiscriminada.

## Resultado del dry-run

El análisis normalizado generó 7,891 registros fuente para staging:

- 5,473 registros fuente de contacto entre las distintas hojas. Esta cifra no
  representa contactos canónicos únicos.
- 5,255 eventos de consentimiento.
- 218 membresías/unidades de abono.
- 27 ventas, 27 partidas y 39 pagos provenientes de la tabla estructurada de
  ventas.
- 2,208 mensajes de campaña agrupados en 3 campañas.
- 15 definiciones del programa de recompensas, conservadas para revisión.
- 148 filas crudas de `Fuente Corte Ventas`, conservadas para revisión y sin
  convertirlas automáticamente en ventas o pagos.
- 3,156 coincidencias candidatas entre fuentes. Son propuestas de conciliación,
  no fusiones automáticas.
- 4 filas en cuarentena por problemas que impiden normalizarlas con seguridad.

## Hallazgos operativos

- La hoja principal de CRM contiene 2,529 contactos y la cartera histórica 219
  registros.
- La bitácora no contiene actividades. Los 2,208 movimientos mostrados por el
  tablero son envíos masivos de una campaña, no seguimientos realizados por un
  ejecutivo. El nuevo CRM separa ambas métricas.
- 102 destinatarios de esos envíos aparecen con autorización de comunicaciones
  en `No`, y 114 no tienen un estado de consentimiento identificable. El CRM no
  habilitará campañas hasta conciliar estos casos.
- La cartera contiene 116 abonados actuales y 103 exabonados. No tiene fechas de
  alta o renovación, próximos seguimientos ni ejecutivos asignados.
- Se detectaron 17 coincidencias especialmente sólidas entre CRM y cartera para
  revisión humana: 10 por correo y teléfono, 3 solo por correo y 4 solo por
  teléfono.
- Hay 103 membresías con temporada no identificada, 27 ventas sin temporada y 7
  ventas sin importe. Ninguna se completará por inferencia silenciosa.
- De las 15 definiciones de recompensas, 13 no tienen una condición utilizable.
  Permanecen en staging hasta definir su regla de negocio.
- En `Fuente Corte Ventas` se conservaron las 148 filas y se marcaron 3 filas
  adicionales dentro de 2 grupos duplicados. No se descartó evidencia.

## Decisiones de diseño resultantes

- PostgreSQL será la fuente de verdad; los CSV y el Excel quedan como fuentes de
  importación y evidencia, no como base multiusuario.
- Contacto, temporada, membresía, interacción, tarea, consentimiento, venta y
  asignación son entidades separadas.
- Clasificación comercial y etapa de seguimiento son campos distintos.
- El último contacto y su canal se derivan de la interacción humana más reciente;
  no se sobreescribe una sola celda de la ficha.
- Las bajas son lógicas y auditadas. Interacciones, asignaciones, importaciones,
  exportaciones y cambios de permisos conservan trazabilidad.
- El identificador de temporada canónico para este proyecto es `LMP-2026-27`.
- Ventas se publica inicialmente en modo de solo lectura. El alta y las
  transiciones de cobro se habilitarán cuando se apruebe su flujo contable.

## Condiciones antes de promover datos

1. Conciliar los 102 consentimientos negativos y los 114 indeterminados antes de
   cualquier campaña.
2. Revisar las 4 cuarentenas y aprobar o descartar cada caso con evidencia.
3. Resolver las 103 temporadas desconocidas y las 27 ventas sin temporada.
4. Completar o clasificar las 7 ventas sin importe.
5. Revisar coincidencias y aprobar fusiones; nunca promover las 3,156 sugerencias
   en bloque.
6. Validar el lote en staging con un administrador identificado antes de una
   eventual migración a producción.
