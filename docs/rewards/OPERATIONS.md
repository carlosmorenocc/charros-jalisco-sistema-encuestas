# OperaciÃ³n y despliegue

## Servicios

- Frontend: Vercel, proyecto `charros-club-recompensas`, con directorio raÃ­z `rewards-web` y framework Vite.
- API: Render, servicio `charros-rewards-api`, desplegado desde la rama `feat/programa-recompensas-lmp-26-27`.
- Base: Render PostgreSQL `charros-rewards-postgres`, independiente del CRM.

ConfiguraciÃ³n verificada el 27 de octubre de 2026:

| Plataforma | Ajuste | Valor esperado |
|---|---|---|
| Vercel | Variable de frontend | `VITE_REWARDS_API_URL` habilitada para Preview y Production |
| Vercel | Build | `npm run build` dentro de `rewards-web` |
| Render | Build | `cd rewards-api && npm ci` |
| Render | Start | `cd rewards-api && npm run migrate && npm start` |
| Render | Health check | `/ready` |
| Render | Auto deploy | Activado para la rama de recompensas |

Un push a la rama crea un Preview en Vercel y despliega el API en Render. El Preview permite validar el commit con la configuraciÃ³n de Preview, pero no es el mismo artefacto que Production: al promover directamente un Preview, Vercel lo reconstruye con las variables de Production.

Render debe definir `CORS_ORIGINS` como una lista separada por comas que incluya Ãºnicamente el dominio principal y el alias estable de la rama Preview. No uses `*` ni agregues URLs temporales. `CORS_ORIGIN` se conserva como compatibilidad para un solo origen.

## Comandos locales

```bash
cd rewards-api && npm ci && npm test
cd rewards-web && npm ci && npm test && npm run build
```

Las migraciones son acumulativas e inmutables. Nunca edites una migraciÃ³n ya aplicada; agrega la siguiente numeraciÃ³n.

## CorrecciÃ³n autoritativa puntual

Una discrepancia comercial confirmada despuÃ©s de cargar asistencias se corrige en sitio con el prearranque transaccional del API; no se reemplaza el padrÃ³n ni se crean programas nuevos. El valor completo vive temporalmente en el secreto `REWARDS_ORDER_CORRECTION` de Render y nunca se copia a Git, documentaciÃ³n, tickets o logs.

El secreto es un JSON de versiÃ³n 1 con temporada, orden origen, orden destino, cantidad esperada de programas, SHA-256 del conjunto zona/secciÃ³n/butaca, SHA-256 de la identidad actual, correo corregido y un cÃ³digo de motivo no personal. El proceso:

1. genera los dos controles SHA-256 fuera del repositorio;
2. configura el secreto solo en el API personal autorizado;
3. despliega y exige coincidencia exacta de orden, programas, titular y controles;
4. renombra la misma orden y actualiza los mismos programas dentro de una transacciÃ³n, conservando IDs, asistencias y canjes;
5. verifica el resultado agregado y elimina inmediatamente el secreto;
6. vuelve a desplegar sin el secreto y comprueba `/ready`.

Si cualquier guarda difiere, el arranque falla y no confirma ninguna correcciÃ³n. El diagnÃ³stico publica Ãºnicamente un cÃ³digo tÃ©cnico de lista cerrada. Un fallo de consulta se identifica solo por su etapa `DB_*`; cualquier otro fallo se reduce a `UNEXPECTED_ERROR`. Nunca se imprimen mensaje, detalle, consulta, parÃ¡metros ni valores operativos. El script es idempotente para un despliegue repetido. La bitÃ¡cora conserva Ãºnicamente el UUID interno, la cantidad y un cÃ³digo de motivo de lista cerrada; no copia Ã³rdenes, correo ni controles derivados de esos valores.

## CorrecciÃ³n autoritativa de secciones de programas

Una secciÃ³n desactualizada confirmada contra la fuente autoritativa se corrige sobre los programas existentes mediante el prearranque transaccional del API. Este procedimiento no representa un cambio fÃ­sico de butaca: conserva temporada, orden, titular, zona, asiento y segmento, y modifica Ãºnicamente la secciÃ³n. Tampoco reemplaza el padrÃ³n, crea programas o aliases, ni vuelve a importar asistencias.

La solicitud completa se entrega temporalmente en el secreto `REWARDS_PROGRAM_SECTION_CORRECTION`. El JSON de versiÃ³n 1 admite Ãºnicamente `version`, `seasonCode`, `expectedProgramCount`, `reasonCode` y `programs`. Cada elemento de `programs` declara `programId`, `permanentKey`, `orderNumber`, `expectedSegment`, `zone`, `fromSection`, `toSection` y `seat`; `expectedSegment` solo admite `VIP`, `PREFERENTE` o `GENERAL`. La cantidad debe coincidir exactamente con `expectedProgramCount`, entre 1 y 1000, y el Ãºnico motivo admitido es `boleto-movil-verified`. No se aceptan campos adicionales, UUID repetidos, claves permanentes repetidas, secciones equivalentes despuÃ©s de normalizarlas, llaves de origen duplicadas ni ubicaciones fÃ­sicas de destino duplicadas dentro de la solicitud. Todos los valores operativos se generan y conservan fuera de Git, documentaciÃ³n, tickets y logs.

Procedimiento:

1. Confirma respaldo, entorno, commit y fuente autoritativa. ObtÃ©n fuera del repositorio una fotografÃ­a de los UUID internos y de los conteos de asistencias, entregas y aliases de los programas involucrados.
2. Verifica antes de escribir que todos los UUID y claves permanentes esperados existen una sola vez, pertenecen a la temporada, orden, segmento, zona, secciÃ³n anterior y asiento declarados, y permanecen activos y elegibles. Cada programa debe conservar ademÃ¡s un `order_id` que apunte a una fila de `rewards_orders` con la misma temporada y orden.
3. Simula el estado final y exige cero colisiones normalizadas con la llave Ãºnica de programa, incluyendo filas inactivas o excluidas; cero duplicados fÃ­sicos activos y elegibles, incluso entre Ã³rdenes distintas; y cero aliases activos que puedan interceptar una nueva llave y dirigirla a otro programa.
4. Configura `REWARDS_PROGRAM_SECTION_CORRECTION` Ãºnicamente en el API personal autorizado y despliega. El prearranque adquiere un bloqueo asesor y valida el lote completo antes de modificar una fila.
5. En una sola transacciÃ³n conserva `id`, `permanent_key`, titular, orden, zona, asiento y segmento; actualiza la secciÃ³n, activa `manual_lock` y registra una entrada `roster.authoritative_section_correction` por UUID. La auditorÃ­a conserva solo el campo corregido y el cÃ³digo de motivo, no las ubicaciones anteriores o nuevas. Si una sola precondiciÃ³n difiere, se revierte todo el lote y el servicio no arranca.
6. Comprueba que todas las secciones anteriores desaparecieron del conjunto y que todas las nuevas estÃ¡n presentes; compara los UUID y conteos histÃ³ricos con la fotografÃ­a previa, y repite las verificaciones de duplicados fÃ­sicos y aliases.
7. Confirma en el listado y en los perfiles que la secciÃ³n correcta ya se muestra. No es necesario desplegar el frontend porque ambas vistas leen `rewards_programs.section` desde el API.
8. Elimina inmediatamente `REWARDS_PROGRAM_SECTION_CORRECTION`, vuelve a desplegar sin el secreto y verifica `/ready`.

El procedimiento es idempotente Ãºnicamente cuando todos los programas estÃ¡n todavÃ­a en `fromSection` o cuando todos estÃ¡n ya en `toSection` con `manual_lock = true`. Un lote mezclado, una secciÃ³n distinta o una correcciÃ³n final sin bloqueo detiene el arranque; nunca intenta completar silenciosamente un estado parcial. Si el secreto no estÃ¡ configurado, el prearranque queda deshabilitado sin abrir una conexiÃ³n. Los fallos solo publican un cÃ³digo tÃ©cnico de lista cerrada o `UNEXPECTED_ERROR`, y el Ã©xito emite un mensaje genÃ©rico sin valores operativos.

`manual_lock` impide que una carga posterior del padrÃ³n restaure la secciÃ³n obsoleta. Las asistencias y entregas conservan el mismo `program_id`, por lo que sus contadores no cambian. La secciÃ³n anterior no se registra como alias: era un dato incorrecto del padrÃ³n, no una identidad histÃ³rica vÃ¡lida.

## Alta excepcional de un programa autorizado

Una cortesÃ­a de abono individual autorizada, ya sea de giveaway o de promociÃ³n institucional, se incorpora con el prearranque transaccional del API, sin reabrir `roster-bootstrap`. Los datos operativos completos se suministran temporalmente en el secreto `REWARDS_PROGRAM_ENROLLMENT`; nunca se codifican en migraciones, pruebas, documentaciÃ³n, tickets o logs.

El payload versionado debe identificar temporada, titular, orden y una sola butaca, declarar exactamente `authorized_giveaway_courtesy` o `authorized_promotional_courtesy` segÃºn la decisiÃ³n autorizada y, si corresponde reconstruir visitas, enumerar cada asistencia mediante la pareja exacta SHA-256 de importaciÃ³n + fecha de juego junto con sus datos operativos. Correo y telÃ©fono pueden ser nulos cuando la fuente autoritativa no los contiene; no se completan mediante una uniÃ³n silenciosa por nombre. El secreto admite un solo programa: varias altas se procesan secuencialmente, verificando y retirando el valor temporal despuÃ©s de cada una. Si varias butacas pertenecen a la misma orden, la primera ejecuciÃ³n crea la orden y las siguientes la reutilizan Ãºnicamente cuando titular y todos los metadatos comerciales coinciden exactamente; cada butaca conserva su propio programa, historial y contador.

Procedimiento:

1. Confirma respaldo, entorno y commit, y verifica fuera del repositorio que la butaca no colisiona con un programa activo, alias u otra orden.
2. Genera el JSON fuera de Git y configura `REWARDS_PROGRAM_ENROLLMENT` Ãºnicamente en el API personal autorizado.
3. Despliega. El prearranque adquiere un bloqueo asesor y valida esquema, temporada, lista cerrada, unicidad de titular/orden/programa y controles de cada importaciÃ³n antes de escribir.
4. En una sola transacciÃ³n crea o reutiliza de forma idempotente el titular y la orden, crea exactamente un programa bloqueado para cambios automÃ¡ticos y registra Ãºnicamente las asistencias histÃ³ricas cuyo SHA-256 y fecha coinciden con importaciones confirmadas.
5. Comprueba el resultado mediante agregados y un diagnÃ³stico de lista cerrada; nunca expongas datos personales, Ã³rdenes, butacas, cÃ³digos de barras ni el payload en logs.
6. Elimina inmediatamente `REWARDS_PROGRAM_ENROLLMENT`, vuelve a desplegar sin el secreto y verifica `/ready`.
7. Confirma en la interfaz que existe un solo programa, que el contador histÃ³rico esperado es correcto y que la excepciÃ³n no altera otros compromisos, patrocinadores o suites.

La ejecuciÃ³n es idempotente: repetir exactamente el mismo payload no duplica titular, orden, programa ni asistencias. Una colisiÃ³n, una diferencia parcial, un digest/fecha inexistente o cualquier guarda incumplida revierte toda la transacciÃ³n y detiene el arranque con un cÃ³digo tÃ©cnico no sensible. La bitÃ¡cora solo conserva UUID interno del programa, cantidad agregada y cÃ³digo de motivo. Para corregir datos despuÃ©s del alta se usa un procedimiento tÃ©cnico explÃ­cito; no se reutiliza el secreto ni se amplÃ­a la excepciÃ³n de forma global.

## Cuentas

El script `rewards-api/scripts/provision-users.js` crea o restablece exclusivamente las cuentas permitidas. Solicita la contraseÃ±a de forma interactiva, fuerza su cambio en el primer ingreso y revoca sesiones anteriores.

```bash
cd rewards-api
npm run provision -- --email correo@charrosdejalisco.com
```

## Seguridad operativa

- No copies `DATABASE_URL`, `PASSWORD_PEPPER`, claves de sesiÃ³n ni contraseÃ±as a documentaciÃ³n, comandos compartidos o Git.
- MantÃ©n PostgreSQL sin acceso externo salvo una regla temporal y justificada.
- Verifica `/ready` despuÃ©s de cada despliegue del API.
- Verifica login, bÃºsqueda, importaciÃ³n de una muestra, canje y reversiÃ³n en el Preview antes de promover Vercel a Production.
- Antes de un cambio de esquema, confirma respaldo y plan persistente de PostgreSQL.
- Rewards no estÃ¡ declarado en el `render.yaml` raÃ­z, que pertenece al CRM; su servicio estÃ¡ configurado directamente en Render y estos valores deben compararse con la tabla anterior despuÃ©s de cualquier traspaso.

El inicio de sesiÃ³n permite que el equipo comparta la misma red: los accesos correctos no consumen la cuota de fallos. Se limitan 30 intentos fallidos por IP y 5 por combinaciÃ³n IP + correo durante 15 minutos.

Cuando un cambio haga obligatorios nuevos identificadores de versiÃ³n en las mutaciones, publica primero el frontend compatible y despuÃ©s el API. De esta forma, una pestaÃ±a antigua puede recibir un conflicto seguro y solicitar actualizaciÃ³n, pero nunca modificar una entrega distinta.

## Secuencia de publicaciÃ³n

1. Ejecuta pruebas y build local de ambos mÃ³dulos.
2. Confirma que el commit y la rama son los esperados.
3. Haz push; espera a que Render termine migraciÃ³n y health check.
4. Valida el Preview de Vercel contra el API desplegado.
5. Desde el mismo commit, crea un deployment con objetivo Production sin asignarle todavÃ­a el dominio principal y valida ese artefacto con las variables de Production.
6. Promueve el deployment de Production ya validado; no promociones directamente un Preview si necesitas conservar exactamente el artefacto probado.
7. Registra las cuentas de consulta con contraseÃ±as temporales distintas y confirma el cambio obligatorio en el primer ingreso.

## Riesgo pendiente

Al 27 de octubre de 2026, Render reportaba `charros-rewards-postgres` en plan Free con expiraciÃ³n indicada para el 23 de noviembre de 2026. Debe migrarse a un plan persistente o infraestructura institucional antes de esa fecha para evitar pÃ©rdida de datos.

