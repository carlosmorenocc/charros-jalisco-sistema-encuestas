# Arquitectura — Programa de Recompensas Club Charros

Aplicación independiente del CRM y de las encuestas públicas.

```text
Navegador
   │ HTTPS + cookie segura + CSRF
   ▼
rewards-web (React/Vite en Vercel)
   │ JSON / Excel
   ▼
rewards-api (Node/Express en Render)
   │ conexión privada
   ▼
charros-rewards-postgres (PostgreSQL en Render)
```

## Límites del módulo

- `rewards-web` consume exclusivamente `rewards-api`.
- `rewards-api` usa exclusivamente tablas con prefijo `rewards_`.
- No comparte sesiones, cookies, usuarios, tablas ni secretos con `crm-*`.
- Los Excel se procesan en memoria; el archivo original no se conserva en Git ni en el servidor.

## Responsabilidades

| Componente | Responsabilidad |
|---|---|
| `rewards-web` | Login, resumen, búsqueda, filtros, perfil, entregas reversibles e importación administrativa |
| `rewards-api/src/app.js` | Autenticación, autorización, consultas, entregas, importaciones y auditoría |
| `rewards-api/src/workbook.js` | Lectura, normalización, exclusiones y conciliación de Excel |
| `rewards-api/src/segments.js` | Fuente única de clasificación VIP/Preferente/General |
| `rewards-api/migrations/` | Esquema acumulativo, catálogo y calendario |
| PostgreSQL | Estado durable, deduplicación, sesiones y trazabilidad |

## Estado de operación

- Frontend activo en el proyecto Vercel `charros-club-recompensas`.
- API activa en el servicio Render `charros-rewards-api`.
- Rama de despliegue: `feat/programa-recompensas-lmp-26-27`.
- Temporada configurada: `LMP-2026-27`, 34 juegos regulares como local y sin playoffs.

En producción deben mantenerse `SESSION_COOKIE_SECURE=true` y `SESSION_COOKIE_SAME_SITE=none`, porque Vercel y Render usan dominios distintos. `CORS_ORIGIN` debe contener únicamente el dominio HTTPS exacto del frontend.

Consulta [INDEX.md](INDEX.md) para abrir solo la documentación necesaria de cada flujo.
