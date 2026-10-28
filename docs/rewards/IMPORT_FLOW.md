# Carga inicial del padrón e importación de asistencias

El orden es obligatorio: primero se carga una sola vez el padrón aprobado mediante el endpoint técnico; después, cada historial de accesos se importa desde la interfaz. La interfaz no acepta padrones y el endpoint técnico no sustituye el flujo cotidiano de asistencias.

## Carga inicial controlada del padrón

1. Conserva el archivo fuente y el payload fuera de Git, chats, tickets y documentación. Trabaja únicamente con la versión aprobada y confirma que existe un respaldo recuperable de PostgreSQL.
2. Ejecuta las migraciones antes de cargar datos y verifica que el entorno y la temporada de destino sean los correctos. No habilites este procedimiento en más de un entorno a la vez.
3. Crea un token aleatorio de un solo uso en el gestor de secretos y abre una ventana breve con `REWARDS_ROSTER_IMPORT_ENABLED=true` y `REWARDS_ROSTER_IMPORT_TOKEN` configurado únicamente en el API.
4. Envía el payload por HTTPS a `POST /api/internal/roster-bootstrap?mode=preview` con `Authorization: Bearer <token efímero>`. La previsualización no escribe datos: normaliza las filas, valida campos y llaves únicas, coteja los totales aprobados por segmento y devuelve totales agregados y un SHA-256 estable.
5. Compara esos agregados y el SHA-256 con el control aprobado. No confirmes si hay errores, duplicados, segmentos desconocidos o cualquier diferencia; corrige la fuente fuera del repositorio y vuelve a previsualizar.
6. Sin modificar el payload validado, envíalo al mismo endpoint con `mode=confirm`. La confirmación es transaccional: se guardan titulares, órdenes y programas completos o no se guarda nada. El mismo SHA-256 es idempotente y no crea una segunda carga.
7. Verifica los totales agregados, la distribución por segmento, que no existan enlaces huérfanos y que el padrón pueda consultarse en la interfaz. Conserva como evidencia únicamente fecha, entorno, operador, SHA-256 y agregados; nunca el payload ni datos personales.
8. Inmediatamente después del resultado satisfactorio, configura `REWARDS_ROSTER_IMPORT_ENABLED=false`, retira el token y verifica que el endpoint quede cerrado.

Si la respuesta de confirmación se pierde, reintenta solamente el payload idéntico mientras la ventana siga abierta; la idempotencia por SHA-256 permite comprobar el resultado sin duplicarlo. Después de cargar asistencias, no se debe reemplazar el padrón, truncar tablas ni reabrir el bootstrap para aplicar correcciones: cualquier cambio requiere respaldo, trazabilidad y un procedimiento técnico específico.

Cuando Boleto Móvil confirme una discrepancia puntual después del bootstrap, usa el procedimiento temporal de corrección autoritativa descrito en `OPERATIONS.md`. Sus valores privados se suministran como secreto efímero; nunca se codifican en una migración ni en el repositorio.

## Historiales de asistencia por interfaz

Para cada partido, el administrador sigue este flujo en `Importar`:

1. Descarga de Boleto Móvil el reporte detallado del partido y lo mantiene fuera del repositorio.
2. Selecciona explícitamente el partido y marca el corte como `Parcial` o `Cerrado`. Usa `Cerrado` solo cuando el reporte sea definitivo.
3. Selecciona el XLSX y pulsa `Previsualizar`. Todavía no se escribe información.
4. Comprueba que la fecha corresponde al partido, que las cifras conciliadas son las esperadas y que toda fila excluida o duplicada tiene una explicación. Si hay filas `Por revisar`, no confirmes hasta resolverlas.
5. Confirma la importación. El API vuelve a validar el archivo, guarda su SHA-256 y las nuevas asistencias en una sola transacción.
6. Registra solo el SHA-256 y el resumen agregado, y verifica el resultado en Resumen y en una muestra de perfiles sin copiar datos personales a la evidencia operativa.

El API concilia cada acceso contra una sola butaca activa. Primero busca orden + zona + sección + asiento; después admite una equivalencia única de nombre de zona y, como último recurso, una coincidencia única de orden + asiento compatible con el segmento. Los cambios históricos de orden o butaca solo se aceptan mediante `rewards_program_aliases`: nunca se infieren por nombre, correo o teléfono.

Se aceptan filas `Abono` de los productos aprobados y también `Cortesía abono` cuando esa fila concilia con una butaca activa del padrón; esto conserva los abonos 2x1. Se excluyen boletos de ocasión, cortesías ordinarias, suites, compromisos, patrocinadores y colaboradores. Una fila con patrocinador informado se excluye incluso si su tipo o evento parece elegible.

Los escaneos repetidos se agrupan por programa + partido, no por dispositivo ni ronda, y se conserva la hora de ingreso más temprana. Un mismo archivo no puede confirmarse dos veces y la restricción programa + partido impide sumar dos veces una butaca entre cortes. La confirmación se bloquea si queda al menos una fila `Por revisar`. Un corte parcial posterior debe provenir de una nueva exportación; un corte cerrado no vuelve a estado parcial.

No se deben contar suites, compromisos, patrocinios, colaborador ni modalidades excluidas del padrón aprobado. Solo un administrador puede realizar ambas cargas y nunca se deben reutilizar credenciales, tablas o archivos del CRM.
