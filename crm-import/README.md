# Importador seguro del CRM de abonados

Herramienta aislada para auditar un libro XLSX y dejar sus filas en el área de **staging** de PostgreSQL. El modo predeterminado es `dry-run`. Incluye además un promotor histórico separado y explícito para el corte inicial aprobado; nunca fusiona identidades ni convierte candidatos pendientes en contactos canónicos.

## Principios de seguridad

- El libro real nunca debe guardarse en Git. `.gitignore` excluye `*.xlsx`, `input/`, `.env` y `reports/`.
- Sólo se acepta `.xlsx`; se rechazan `.xls` y `.xlsm`.
- Se valida tamaño, firma ZIP y SHA-256 antes de interpretar el libro.
- Las fórmulas no se ejecutan. Sólo se lee un resultado cacheado cuando existe.
- Si ExcelJS encuentra exactamente un `x:sst` vacío y auto-cerrado, se habilita un fallback cerrado: valida que no existan referencias a shared strings, normaliza únicamente las etiquetas `x:` ligadas al namespace OOXML principal en partes conocidas y vuelve a leer una copia ZIP sólo en memoria. El archivo original nunca se reescribe.
- Se excluyen filas vacías, no materiales y plantillas que contienen únicamente fórmulas.
- Los reportes y manifiestos contienen únicamente hashes, conteos y códigos de calidad; no contienen nombres, correos, teléfonos ni muestras de filas.
- Los datos crudos con PII sólo existen en memoria durante el proceso y, con confirmación explícita, en `source_records.raw_payload` de PostgreSQL staging.
- Ningún candidato se fusiona automáticamente. Todos quedan en `import_match_candidates` con `pending_review`.
- La escritura es transaccional, usa un bloqueo asesor y rechaza volver a cargar el mismo hash.

## Alcance de la transformación

La configuración versionada está en [`config/sheets.json`](config/sheets.json):

| Hoja | Salida normalizada de staging |
|---|---|
| CRM Prospectos | Contactos, aliases y eventos de consentimiento |
| Cartera Abonados | Contactos, membresías y una unidad por cada abono conocido |
| Bitácora Contactos | Interacciones pendientes de resolver contra contacto |
| Ventas Consolidadas | Venta y componentes de pago pendientes de resolver |
| Catálogos | Ejecutivos, estados, periodos y combinaciones producto/zona/precio |
| Historial Envíos | Mensajes de campaña; nunca se convierten en contacto humano |
| Programa Recompensas | Definiciones crudas `requires_review`; no se publican ni habilitan canjes |
| Fuente Corte Ventas | Filas crudas `requires_review`; no se convierten en ventas ni pagos |
| Fuente Encuesta Corta/Larga | Identidad fuente, aliases y consentimiento histórico |

`Dashboard Ejecutivo` no se importa porque es una vista calculada reproducible. Las dos hojas auxiliares se preservan únicamente como procedencia staging: condiciones incompletas, posibles subtotales y duplicados quedan señalados para revisión y jamás se promueven automáticamente.

Cada fila aceptada conserva:

- hoja y número de fila;
- ID original (`submissionId`, ID CRM, ID cartera u otro disponible);
- carga cruda y carga normalizada;
- fingerprint SHA-256 de identidad normalizada;
- errores de validación y resolución;
- relación con todos sus aliases y eventos de consentimiento.

La cantidad de abonos no queda sólo como `seat_count`: cuando el número es válido, staging crea también `membership_units` numeradas. La promoción posterior puede completar asiento, zona, producto o talla por unidad.

Los campos históricos llamados “último contacto” se conservan como `legacyLastContactAt` con `requiresHumanContactReview`; no actualizan `last_human_contact_at`. Los registros de `Historial Envíos` se modelan exclusivamente como campañas y mensajes.

Las variantes reconocidas de la temporada 2026–2027 (`LMP 2026-2027`, `LMP-2026-2027`, `LMP 26-27` y equivalentes de separador) se normalizan a `LMP-2026-27`. Una temporada ausente o diferente conserva el valor fuente y queda `requires_review`; nunca se inventa un código.

## Corrección controlada de antigüedad

La única corrección automática de contenido es específica para el campo `antiguedad` de `Fuente Encuesta Larga`:

- `01-mar`, o una fecha de Excel con día 1 y mes 3, se interpreta como `1-3`.
- `04-jul`, o una fecha de Excel con día 4 y mes 7, se interpreta como `4-7`.

La regla no opera en otra hoja ni en otro campo. Cada aplicación incrementa un código de corrección en el reporte sanitizado. Cambiar esta política requiere versionar `config/sheets.json` y volver a ejecutar primero un dry-run.

## Requisitos

- Node.js 20 o posterior.
- Dependencias declaradas: `exceljs` y `pg`.
- Migraciones del backend aplicadas, incluyendo `import_batches`, `source_records` e `import_match_candidates`.
- Un usuario administrador activo en `app_users` que será responsable del lote.

No se instalaron dependencias al crear esta herramienta. En un entorno autorizado:

```powershell
npm install --ignore-scripts
```

## Auditoría segura — modo predeterminado

Ejecutar desde esta carpeta:

```powershell
npm run audit -- --file "C:\ruta-privada\crm.xlsx"
```

También puede declararse explícitamente:

```powershell
npm run audit -- --file "C:\ruta-privada\crm.xlsx" --dry-run
```

El proceso muestra el SHA-256 y genera artefactos que también fijan el hash de la configuración:

- `reports/audit-<hash>.json`
- `reports/manifest-<hash>.json`

En dry-run no se carga `pg`, no se abre una conexión y no se escribe en PostgreSQL.

## Commit explícito a staging

El Blueprint mantiene PostgreSQL cerrado a Internet. Por ello, las instrucciones
locales siguientes solo funcionan cuando existe un acceso temporal aprobado para
la IP exacta del operador y una URL externa con TLS, o cuando el comando se
ejecuta desde un runner privado autorizado. La regla temporal debe retirarse al
terminar. No se permite `0.0.0.0/0` y este importador nunca debe apuntar a
producción.

`DATABASE_URL` debe pertenecer a un rol exclusivo del importador: lectura de
`app_users`, lectura/escritura del lote en `import_batches` e inserción en
`source_records` e `import_match_candidates`. No use la credencial propietaria
del API ni conceda escritura sobre las tablas canónicas.

Primero se ejecuta el dry-run y se revisan conteos, cuarentena, correcciones y candidatos. Después, en la misma sesión de terminal, se proporcionan las cuatro credenciales/barreras:

```powershell
$env:CRM_IMPORT_ENVIRONMENT = "staging"
$env:CRM_IMPORT_ALLOW_WRITE = "true"
$env:CRM_IMPORT_UPLOADED_BY = "UUID-DE-UN-ADMIN-ACTIVO"
$env:DATABASE_URL = "URL-EXCLUSIVA-DE-POSTGRESQL-STAGING"

npm run audit -- --file "C:\ruta-privada\crm.xlsx" --commit --confirm-sha "SHA256-DEL-DRY-RUN"
```

La escritura se rechaza si:

- el entorno no es exactamente `staging`;
- `CRM_IMPORT_ALLOW_WRITE` no es exactamente `true`;
- el hash confirmado no coincide byte por byte;
- falta la URL o el UUID responsable;
- el usuario no está activo;
- las tablas no cumplen el contrato esperado;
- falta una hoja configurada o no puede detectarse su encabezado;
- el mismo SHA-256 ya fue cargado.

Un commit correcto termina el lote en `validated`, no en `imported`. La promoción canónica es un segundo comando, transaccional e idempotente. Requiere la migración `005_initial_import_promotion.sql`, modo mantenimiento, un respaldo o punto de recuperación verificado, el SHA exacto del plan y el conjunto completo de métricas mostrado por el dry-run:

```powershell
$env:CRM_PROMOTION_ENVIRONMENT = "staging"
$env:CRM_PROMOTION_ALLOW_WRITE = "true"
$env:CRM_PROMOTION_ADMIN_ID = "UUID-DE-UN-ADMIN-ACTIVO"

# Revisión sin escritura
npm run promote -- --batch "UUID-DEL-LOTE"

# Commit abreviado: repetir cada entrada de requiredCommitExpectations como --expect nombre=valor
npm run promote -- --batch "UUID-DEL-LOTE" --commit --confirm-plan "SHA256-DEL-PLAN" --expect contactsCreated=2727
```

El ejemplo abreviado de commit no es suficiente por sí solo: el guard exige **todas** las entradas de `requiredCommitExpectations`. El promotor inicial sólo crea los contactos inequívocos, membresías vigentes verificadas, consentimientos históricos y campañas aprobadas. Las filas bloqueadas, diferidas o en cuarentena permanecen en staging y se registran en el ledger; no se autofusionan.

## Clasificación de posibles coincidencias

- `high`: correo y teléfono normalizados coinciden.
- `medium`: coincide correo o teléfono.
- `low`: coincide un nombre completo de al menos dos palabras.

Los grupos mayores a 25 se marcan como problema de calidad y no generan combinaciones masivas. Aceptar un candidato es una decisión humana posterior; este CLI no escribe en `contact_merges`.

## Pruebas

Las pruebas usan exclusivamente [`tests/fixtures/synthetic-workbook.json`](tests/fixtures/synthetic-workbook.json). El fixture no contiene datos reales ni necesita conexión:

```powershell
npm test
```

Cubren:

- exclusión de filas formula-only;
- normalización y unidades de membresía;
- corrección controlada de antigüedad;
- cuarentena;
- candidatos sin autofusión;
- ausencia de PII en el reporte;
- barreras de commit y argumentos incompatibles.

## Operación recomendada

1. Trabajar siempre contra una copia privada e inmutable del XLSX.
2. Ejecutar pruebas y dry-run.
3. Comparar el hash del manifiesto con el archivo autorizado.
4. Revisar especialmente consentimiento, ventas sin importe, identidades inválidas y volumen de merges.
5. Crear o verificar un respaldo de staging.
6. Ejecutar commit una sola vez.
7. Revisar `source_records` e `import_match_candidates` mediante un procedimiento
   administrativo controlado en staging. La primera entrega aún no publica una
   pantalla de conciliación en el CRM.
8. Activar mantenimiento y drenar solicitudes antes de cualquier promoción.
9. Ejecutar el dry-run del lote, confirmar SHA y todas las métricas y promover con el CLI; nunca mediante cambios manuales en SQL.
10. Validar conteos y fechas históricas antes de retirar mantenimiento.

## Límites deliberados

- El CLI no crea tablas ni aplica migraciones.
- El comando `audit` sólo escribe staging. El comando separado `promote` escribe el subconjunto canónico aprobado; nunca crea interacciones, tareas o ventas a partir de este corte.
- No decide qué consentimiento es vigente; conserva todos los eventos y su procedencia.
- No considera un correo masivo como interacción humana.
- No elimina duplicados ni repara correos/teléfonos por aproximación.
- No imprime filas problemáticas. Su revisión debe realizarse mediante un canal
  administrativo aprobado dentro de staging; no mediante archivos compartidos ni
  una pantalla que la primera entrega todavía no incluye.
