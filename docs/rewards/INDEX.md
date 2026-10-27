# Índice operativo — Programa de Recompensas

Usa este índice para leer solo el contexto necesario.

| Pregunta o cambio | Documento | Código principal |
|---|---|---|
| Roles, acceso, login o logout | [ACCESS_AND_ROLES.md](ACCESS_AND_ROLES.md) | `rewards-api/src/app.js`, `rewards-api/src/security.js`, `rewards-web/src/` |
| Hitos, canjes o correcciones | [BUSINESS_RULES.md](BUSINESS_RULES.md) | `rewards-api/src/app.js`, componentes de perfil en `rewards-web/src/` |
| Tablas, relaciones o migraciones | [DATA_MODEL.md](DATA_MODEL.md) | `rewards-api/migrations/` |
| Carga de asistencias y conciliación | [IMPORT_FLOW.md](IMPORT_FLOW.md) | `rewards-api/src/workbook.js`, `rewards-web/src/ImportPanel.jsx` |
| Despliegue, cuentas o recuperación | [OPERATIONS.md](OPERATIONS.md) | `rewards-api/scripts/`, Render y Vercel |
| Vista general técnica | [ARCHITECTURE.md](ARCHITECTURE.md) | `rewards-api/`, `rewards-web/` |

La fuente comercial es el reporte detallado de Boleto Móvil. Los archivos originales contienen datos personales y permanecen fuera del repositorio.
