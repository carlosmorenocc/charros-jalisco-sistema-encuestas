# Operación y despliegue

## Servicios

- Frontend: Vercel, proyecto `charros-club-recompensas`, con directorio raíz `rewards-web` y framework Vite.
- API: Render, servicio `charros-rewards-api`, desplegado desde la rama `feat/programa-recompensas-lmp-26-27`.
- Base: Render PostgreSQL `charros-rewards-postgres`, independiente del CRM.

Configuración verificada el 27 de octubre de 2026:

| Plataforma | Ajuste | Valor esperado |
|---|---|---|
| Vercel | Variable de frontend | `VITE_REWARDS_API_URL` habilitada para Preview y Production |
| Vercel | Build | `npm run build` dentro de `rewards-web` |
| Render | Build | `cd rewards-api && npm ci` |
| Render | Start | `cd rewards-api && npm run migrate && npm start` |
| Render | Health check | `/ready` |
| Render | Auto deploy | Activado para la rama de recompensas |

Un push a la rama crea un Preview en Vercel y despliega el API en Render. El Preview permite validar el commit con la configuración de Preview, pero no es el mismo artefacto que Production: al promover directamente un Preview, Vercel lo reconstruye con las variables de Production.

Render debe definir `CORS_ORIGINS` como una lista separada por comas que incluya únicamente el dominio principal y el alias estable de la rama Preview. No uses `*` ni agregues URLs temporales. `CORS_ORIGIN` se conserva como compatibilidad para un solo origen.

## Comandos locales

```bash
cd rewards-api && npm ci && npm test
cd rewards-web && npm ci && npm test && npm run build
```

Las migraciones son acumulativas e inmutables. Nunca edites una migración ya aplicada; agrega la siguiente numeración.

## Corrección autoritativa puntual

Una discrepancia comercial confirmada después de cargar asistencias se corrige en sitio con el prearranque transaccional del API; no se reemplaza el padrón ni se crean programas nuevos. El valor completo vive temporalmente en el secreto `REWARDS_ORDER_CORRECTION` de Render y nunca se copia a Git, documentación, tickets o logs.

El secreto es un JSON de versión 1 con temporada, orden origen, orden destino, cantidad esperada de programas, SHA-256 del conjunto zona/sección/butaca, SHA-256 de la identidad actual, correo corregido y un código de motivo no personal. El proceso:

1. genera los dos controles SHA-256 fuera del repositorio;
2. configura el secreto solo en el API personal autorizado;
3. despliega y exige coincidencia exacta de orden, programas, titular y controles;
4. renombra la misma orden y actualiza los mismos programas dentro de una transacción, conservando IDs, asistencias y canjes;
5. verifica el resultado agregado y elimina inmediatamente el secreto;
6. vuelve a desplegar sin el secreto y comprueba `/ready`.

Si cualquier guarda difiere, el arranque falla y no confirma ninguna corrección. El diagnóstico publica únicamente un código técnico de lista cerrada. Un fallo de consulta se identifica solo por su etapa `DB_*`; cualquier otro fallo se reduce a `UNEXPECTED_ERROR`. Nunca se imprimen mensaje, detalle, consulta, parámetros ni valores operativos. El script es idempotente para un despliegue repetido. La bitácora conserva únicamente el UUID interno, la cantidad y un código de motivo de lista cerrada; no copia órdenes, correo ni controles derivados de esos valores.

## Alta excepcional de un programa autorizado

Una cortesía de abono de giveaway autorizada se incorpora con el prearranque transaccional del API, sin reabrir `roster-bootstrap`. Los datos operativos completos se suministran temporalmente en el secreto `REWARDS_PROGRAM_ENROLLMENT`; nunca se codifican en migraciones, pruebas, documentación, tickets o logs.

El payload versionado debe identificar temporada, titular, orden y una sola butaca, declarar `authorized_giveaway_courtesy`, incluir un código de motivo no personal y, si corresponde reconstruir visitas, enumerar cada asistencia mediante la pareja exacta SHA-256 de importación + fecha de juego junto con sus datos operativos. Correo y teléfono pueden ser nulos cuando la fuente autoritativa no los contiene; no se completan mediante una unión silenciosa por nombre.

Procedimiento:

1. Confirma respaldo, entorno y commit, y verifica fuera del repositorio que la butaca no colisiona con un programa activo, alias u otra orden.
2. Genera el JSON fuera de Git y configura `REWARDS_PROGRAM_ENROLLMENT` únicamente en el API personal autorizado.
3. Despliega. El prearranque adquiere un bloqueo asesor y valida esquema, temporada, lista cerrada, unicidad de titular/orden/programa y controles de cada importación antes de escribir.
4. En una sola transacción crea o reutiliza de forma idempotente el titular y la orden, crea exactamente un programa bloqueado para cambios automáticos y registra únicamente las asistencias históricas cuyo SHA-256 y fecha coinciden con importaciones confirmadas.
5. Comprueba el resultado mediante agregados y un diagnóstico de lista cerrada; nunca expongas datos personales, órdenes, butacas, códigos de barras ni el payload en logs.
6. Elimina inmediatamente `REWARDS_PROGRAM_ENROLLMENT`, vuelve a desplegar sin el secreto y verifica `/ready`.
7. Confirma en la interfaz que existe un solo programa, que el contador histórico esperado es correcto y que la excepción no altera otros compromisos, patrocinadores o suites.

La ejecución es idempotente: repetir exactamente el mismo payload no duplica titular, orden, programa ni asistencias. Una colisión, una diferencia parcial, un digest/fecha inexistente o cualquier guarda incumplida revierte toda la transacción y detiene el arranque con un código técnico no sensible. La bitácora solo conserva UUID interno del programa, cantidad agregada y código de motivo. Para corregir datos después del alta se usa un procedimiento técnico explícito; no se reutiliza el secreto ni se amplía la excepción de forma global.

## Cuentas

El script `rewards-api/scripts/provision-users.js` crea o restablece exclusivamente las cuentas permitidas. Solicita la contraseña de forma interactiva, fuerza su cambio en el primer ingreso y revoca sesiones anteriores.

```bash
cd rewards-api
npm run provision -- --email correo@charrosdejalisco.com
```

## Seguridad operativa

- No copies `DATABASE_URL`, `PASSWORD_PEPPER`, claves de sesión ni contraseñas a documentación, comandos compartidos o Git.
- Mantén PostgreSQL sin acceso externo salvo una regla temporal y justificada.
- Verifica `/ready` después de cada despliegue del API.
- Verifica login, búsqueda, importación de una muestra, canje y reversión en el Preview antes de promover Vercel a Production.
- Antes de un cambio de esquema, confirma respaldo y plan persistente de PostgreSQL.
- Rewards no está declarado en el `render.yaml` raíz, que pertenece al CRM; su servicio está configurado directamente en Render y estos valores deben compararse con la tabla anterior después de cualquier traspaso.

El inicio de sesión permite que el equipo comparta la misma red: los accesos correctos no consumen la cuota de fallos. Se limitan 30 intentos fallidos por IP y 5 por combinación IP + correo durante 15 minutos.

Cuando un cambio haga obligatorios nuevos identificadores de versión en las mutaciones, publica primero el frontend compatible y después el API. De esta forma, una pestaña antigua puede recibir un conflicto seguro y solicitar actualización, pero nunca modificar una entrega distinta.

## Secuencia de publicación

1. Ejecuta pruebas y build local de ambos módulos.
2. Confirma que el commit y la rama son los esperados.
3. Haz push; espera a que Render termine migración y health check.
4. Valida el Preview de Vercel contra el API desplegado.
5. Desde el mismo commit, crea un deployment con objetivo Production sin asignarle todavía el dominio principal y valida ese artefacto con las variables de Production.
6. Promueve el deployment de Production ya validado; no promociones directamente un Preview si necesitas conservar exactamente el artefacto probado.
7. Registra las cuentas de consulta con contraseñas temporales distintas y confirma el cambio obligatorio en el primer ingreso.

## Riesgo pendiente

Al 27 de octubre de 2026, Render reportaba `charros-rewards-postgres` en plan Free con expiración indicada para el 23 de noviembre de 2026. Debe migrarse a un plan persistente o infraestructura institucional antes de esa fecha para evitar pérdida de datos.
