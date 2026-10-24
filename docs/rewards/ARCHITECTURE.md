# Club Charros — Programa de Recompensas

Aplicación independiente del CRM. `rewards-web` consume exclusivamente `rewards-api`; el API usa una base PostgreSQL exclusiva cuyas tablas comienzan con `rewards_`. No se importan módulos, sesiones, cookies, usuarios ni tablas de `crm-*`.

## Desarrollo en Windows

1. Instalar Node.js 20+ y PostgreSQL 16+.
2. Crear una base vacía llamada `charros_rewards` y un usuario dedicado sin permisos sobre otras bases.
3. Copiar `rewards-api/.env.example` a `rewards-api/.env` y generar tres secretos distintos de 32 bytes o más.
4. Copiar `rewards-web/.env.example` a `rewards-web/.env`.
5. Ejecutar `npm install` en ambos directorios.
6. Ejecutar `npm run migrate` y después `npm run provision` en `rewards-api`. Las contraseñas se solicitan de forma interactiva y nunca se imprimen ni guardan en Git.
7. Iniciar `npm run dev` en ambos directorios.

## Estado de despliegue

La publicación institucional no está autorizada todavía. No se modificó ningún servicio ni base del CRM. El repositorio solo tiene configurado el remoto personal `origin`; falta recibir y verificar el remoto institucional antes de establecer un flujo de promoción.

## Archivos privados

Los Excel originales, cargas temporales, respaldos, `.env` y exportaciones permanecen fuera de Git mediante `.gitignore`. Los reportes adjuntos se auditan desde su ubicación local y no se copian al repositorio.
