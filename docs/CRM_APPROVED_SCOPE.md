# CRM de abonados LMP 2026-2027 — alcance aprobado

Fecha de decisión: 21 de agosto de 2026

## Objetivo

Construir, dentro del mismo repositorio, una aplicación privada para administrar
la cartera de abonados y prospectos de Charros de Jalisco. El CRM se despliega
separado de las encuestas públicas para no alterar sus rutas ni ampliar su
superficie de acceso.

## Navegación de la primera entrega

1. **Reporte Dirección**: resumen ejecutivo con filtros y descarga de PDF.
2. **Cartera y Renovaciones**: abonados actuales, exabonados y renovaciones.
3. **Prospectos**: contactos comerciales que todavía no son abonados.
4. **Seguimiento**: tareas, bitácora, vencidos y registros sin asignar dentro de
   una sola ventana operativa.
5. **Ventas**: historial de ventas, cobros y saldos, únicamente en lectura.
6. **Más**: módulos posteriores claramente identificados y sin controles
   aparentes que no funcionen.

No se publica un tablero separado de calidad de datos. Sus alertas aparecen solo
donde sean accionables. El alta o cambio de ventas queda fuera hasta aprobar sus
reglas contables, cancelaciones y devoluciones.

## Identidad visual

- Logo Charros en el extremo superior izquierdo.
- Azul Charros como color principal, fondos neutros y alta densidad informativa.
- Rojo reservado para errores, vencimientos y alertas.
- Diseño adaptable, accesible por teclado y legible en pantallas de oficina.

## Acceso aprobado

Esta primera entrega tiene **una sola cuenta local de Administrador**. No depende
de Microsoft Entra, cuentas Microsoft ni un proveedor externo de identidad.

- El alta y el restablecimiento se ejecutan mediante comandos operativos del API;
  no existe una pantalla pública para crear usuarios.
- La contraseña nunca se guarda en Git, Vercel, el navegador ni este documento.
- El navegador conserva únicamente cookies seguras de sesión; no usa Bearer,
  `localStorage` ni `sessionStorage`.
- La sesión expira por tiempo absoluto e inactividad, y todas las mutaciones
  requieren validación de origen y CSRF.
- El PDF de Dirección contiene solo información agregada, filtros, fecha de corte
  y la leyenda **CONFIDENCIAL · USO INTERNO**. No incluye nombres, correos,
  teléfonos, observaciones ni filas de contactos.

Agregar editores o perfiles múltiples queda para una fase posterior con un
mecanismo de identidad más fuerte. Una sola contraseña local es adecuada para
staging y demostración interna, pero no sustituye MFA.

## Reglas operativas

- Una persona puede tener varios abonos y varias temporadas.
- Las temporadas verificadas se derivan del historial. En el alta manual puede
  capturarse, de forma opcional, el total declarado por la persona; ese dato se
  conserva separado y nunca fabrica membresías históricas.
- Un envío masivo no cuenta como interacción humana ni cambia por sí solo el
  estado a `Contactado`.
- Una renovación exige temporada, fecha y cantidad de abonos.
- Interacciones, ventas, pagos, consentimientos, envíos y auditoría son históricos.
- El borrado de contactos es lógico, requiere motivo y puede restaurarse.
- Crear, editar, exportar, eliminar, restaurar y solicitar un PDF genera auditoría.
- Las campañas con consentimiento `No` o `No consta` permanecen bloqueadas salvo
  una excepción formal y auditable del Club.

## Separación técnica

- `crm-web/`: SPA React/Vite en un proyecto independiente de Vercel.
- `crm-api/`: API Node/Express en Render.
- PostgreSQL administrado en Render como fuente de verdad.
- `crm-import/`: herramienta controlada para la carga inicial única, con staging,
  cuarentena, simulación y conciliación. La operación cotidiana no admite
  importaciones recurrentes; los nuevos registros se capturan manualmente.
- Rama: `feat/crm-abonados-lmp-26-27`.

El Excel original, reportes con datos personales, exportaciones y secretos nunca
deben entrar a Git ni quedar bajo una carpeta pública.

## Condiciones antes de cargar datos reales

1. Desplegar primero en staging y probar login, logout, expiración, cookies,
   proxy same-origin, CSRF y rechazo de orígenes ajenos.
2. Crear el único Administrador con una contraseña larga y única, ingresada
   directamente en Render y retirada del entorno después del bootstrap.
3. Ejecutar migraciones sobre PostgreSQL vacío y validar `/ready`.
4. Confirmar respaldo y restauración del plan de PostgreSQL contratado.
5. Aprobar el reporte sanitizado, candidatos de fusión y filas en cuarentena.
6. Realizar una prueba de aceptación antes de importar o exponer los más de dos
   mil contactos reales.
