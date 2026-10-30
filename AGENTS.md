# Guía de trabajo del repositorio

Este repositorio contiene varios productos. No recorras todo el árbol para una tarea puntual.

## Enrutamiento rápido

- Programa de recompensas: empieza en `docs/rewards/INDEX.md` y abre únicamente el documento del flujo afectado.
- API de recompensas: `rewards-api/`.
- Interfaz de recompensas: `rewards-web/`.
- CRM de abonados: `docs/CRM_TECHNICAL_HANDOFF.md`, `crm-api/` y `crm-web/`.
- Encuestas públicas: `README.md`, `src/` y `server.js`.

## Reglas para recompensas

- La unidad del programa es la butaca/abono, no el correo ni el comprador.
- Una butaca cuenta como máximo una asistencia por partido.
- Un hito `N` se alcanza y se puede entregar desde que existen `N` asistencias conciliadas.
- Una entrega corregida se revierte lógicamente; nunca se borra su historial.
- Solo el administrador importa archivos. Administrador y consulta pueden registrar o corregir entregas.
- No mezcles tablas, cookies, usuarios ni secretos del CRM con recompensas.
- Nunca guardes reportes originales, datos personales de abonados, contraseñas o secretos en Git. La única excepción son nombres y correos institucionales de la lista explícita de personal autorizado; nunca sus credenciales.

## Validación mínima

- Cambios en `rewards-api/`: `npm test` dentro de `rewards-api`.
- Cambios en `rewards-web/`: `npm test` y `npm run build` dentro de `rewards-web`.
- Si cambia una regla, esquema, endpoint o procedimiento, actualiza el documento correspondiente en `docs/rewards/` en el mismo commit.
