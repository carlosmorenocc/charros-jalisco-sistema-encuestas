# Verificación visual sintética

Fecha: 28 de octubre de 2026.

Se ejecutó el frontend local con Vite y se abrió en Google Chrome headless. No se usaron archivos personales ni servicios del CRM.

## Resoluciones verificadas

- 1366 × 768: resumen y listado con búsqueda y filtros acumulativos visibles, sin desbordamiento horizontal.
- 1920 × 1080: resumen y perfil lateral; la ruta en forma de serpiente muestra los 15 hitos del 2 al 30.
- El perfil mantiene titular, contacto, orden, ubicación, contador individual, estado del canje e historial separado.
- Al confirmar una recompensa, el diálogo muestra el hito y beneficio, solicita el nombre de quien recibe y aclara que la fecha y hora se registran automáticamente.
- El historial de entregas se presenta debajo del historial de asistencia y distingue entregas confirmadas de entregas corregidas sin ocultar el destinatario original.
- El campo de destinatario recibe el foco al abrirse, admite envío con teclado y mantiene controles y mensajes legibles en escritorio y móvil.
- La navegación contiene únicamente Resumen, Abonados e Importar para administrador; la vista de Auditoría fue retirada.
- La interfaz respeta `prefers-reduced-motion`.

## Capturas

- `screenshots/resumen-1366x768.png`
- `screenshots/resumen-1920x1080.png`
- `screenshots/abonados-1366x768.png`
- `screenshots/perfil-1920x1080.png`

Estas capturas corresponden exclusivamente a `?demo=1` y usan identidades `ABONADO DEMO`, correos `.invalid`, órdenes y butacas ficticias. La validación end-to-end con PostgreSQL central, sesiones reales e importaciones confirmadas se realizará después del despliegue controlado.
