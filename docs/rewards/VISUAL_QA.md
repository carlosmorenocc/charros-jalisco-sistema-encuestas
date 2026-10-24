# Verificación visual sintética

Fecha: 24 de octubre de 2026.

Se ejecutó el frontend local con Vite y se abrió en Google Chrome headless. No se usaron archivos personales ni servicios del CRM.

## Resoluciones verificadas

- 1366 × 768: resumen y listado con filtros visibles, sin texto cortado ni desbordamiento horizontal.
- 1920 × 1080: resumen y perfil lateral; la fila de recompensas conserva tarjetas legibles y navegación horizontal.
- El perfil mantiene la ubicación, contador individual, acciones con texto e historial separado.
- La interfaz respeta `prefers-reduced-motion`.

## Capturas

- `screenshots/resumen-1366x768.png`
- `screenshots/resumen-1920x1080.png`
- `screenshots/abonados-1366x768.png`
- `screenshots/perfil-1920x1080.png`

Estas capturas corresponden exclusivamente a `?demo=1`. La validación end-to-end con PostgreSQL central, sesiones reales e importaciones confirmadas se realizará antes de autorizar el despliegue institucional.
