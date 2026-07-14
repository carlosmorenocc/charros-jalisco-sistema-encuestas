# Checklist de Validación Final

Usa este checklist para confirmar que el proyecto está 100% listo para producción.

## ✅ Desarrollo

- [ ] **Código limpio**
  - [ ] Sin `console.log()` de debug
  - [ ] Sin variables sin usar
  - [ ] Sin imports innecesarios
  - [ ] Nombres de componentes y variables descriptivos

- [ ] **Tests**
  - [ ] `npm test` pasa sin errores
  - [ ] Cobertura de validación.js >= 80%
  - [ ] FormField.test.jsx ejecuta correctamente

- [ ] **Build**
  - [ ] `npm run build` sin warnings
  - [ ] Carpeta `dist/` se genera correctamente
  - [ ] `npm run preview` funciona

## ✅ Funcionalidad

- [ ] **Formulario multi-step**
  - [ ] Todos los 6 pasos renderean
  - [ ] Progreso bar actualiza correctamente
  - [ ] Botones Atrás/Siguiente funcionan
  - [ ] Prevención de doble envío activa

- [ ] **Validaciones**
  - [ ] Email rechaza formatos inválidos
  - [ ] Teléfono requiere >= 10 dígitos
  - [ ] Campos requeridos muestran error
  - [ ] Mensajes de error en vivo al perder focus
  - [ ] Privacidad es obligatoria

- [ ] **Envío**
  - [ ] Mock submit funciona sin `.env`
  - [ ] Payload incluye todos los campos requeridos
  - [ ] Thank you screen aparece tras envío exitoso
  - [ ] Con `.env`: envío va a Power Automate

## ✅ Diseño & UX

- [ ] **Mobile-first**
  - [ ] Responsive en 320px (iPhone SE)
  - [ ] Responsive en 768px (tablet)
  - [ ] Responsive en 1024px (desktop)
  - [ ] Touch targets >= 44px

- [ ] **Estilo visual**
  - [ ] Colores Charros (azul #0b4aa6, oro, rojo) aplicados
  - [ ] Tipografía legible (16px base en móvil)
  - [ ] Espaciado consistente
  - [ ] Botones con hover/focus states
  - [ ] Form fields con focus visible

- [ ] **Accesibilidad**
  - [ ] Labels asociados a inputs (`for` y `id`)
  - [ ] `aria-invalid` en campos con error
  - [ ] Contraste suficiente (WCAG AA)
  - [ ] Teclado navegable (Tab order correcto)
  - [ ] Mensajes de error anunciados

## ✅ Assets & Imágenes

- [ ] **Logo y assets**
  - [ ] `ch-logo.png` en `src/assets/`
  - [ ] Imágenes optimizadas (< 200KB cada una)
  - [ ] Formatos correctos (PNG con transparencia, JPG comprimido)
  - [ ] Vistas previas sin broken links

- [ ] **Referencias**
  - [ ] Todas las rutas `/assets/...` son correctas
  - [ ] Funcionan en dev (`npm run dev`)
  - [ ] Funcionan en preview (`npm run preview`)

## ✅ Variables de entorno

- [ ] **Desarrollo**
  - [ ] `.env.example` existe con comentarios
  - [ ] `.env.example` incluye `VITE_POWER_AUTOMATE_ENDPOINT`
  - [ ] `.env` está en `.gitignore` (no comiteado)

- [ ] **Producción (Azure)**
  - [ ] Variable `VITE_POWER_AUTOMATE_ENDPOINT` configurada
  - [ ] URL válida del flujo Power Automate

## ✅ Integración Power Automate

- [ ] **Documentación**
  - [ ] [docs/power-automate-flow.md](../docs/power-automate-flow.md) completo
  - [ ] [docs/power-automate-sample-flow.json](../docs/power-automate-sample-flow.json) presente
  - [ ] [docs/sharepoint_columns.csv](../docs/sharepoint_columns.csv) con todas las columnas

- [ ] **Funcionalidad**
  - [ ] Flujo HTTP recibe POST correctamente
  - [ ] Parse JSON mapea payload sin errores
  - [ ] Create item en SharePoint funciona
  - [ ] Correo Outlook se envía
  - [ ] Response HTTP 200 devuelto

- [ ] **Testing**
  - [ ] Postman collection importa sin errores
  - [ ] Request de prueba devuelve 200
  - [ ] Item aparece en SharePoint List

## ✅ Despliegue

- [ ] **GitHub**
  - [ ] Repositorio público o privado
  - [ ] Rama `main` tiene código actualizado
  - [ ] `.gitignore` tiene `node_modules/`, `dist/`, `.env`
  - [ ] README.md completo
  - [ ] Carpeta `docs/` con todas las guías

- [ ] **GitHub Actions**
  - [ ] `.github/workflows/azure-static-web-apps.yml` presente
  - [ ] Workflow se ejecuta en cada push
  - [ ] Build completa sin errores
  - [ ] Artifact `dist/` generado

- [ ] **Azure Static Web Apps**
  - [ ] Recurso creado en Azure Portal
  - [ ] Conectado a GitHub (`main` branch)
  - [ ] App location: `/`
  - [ ] Output location: `dist`
  - [ ] Variable `VITE_POWER_AUTOMATE_ENDPOINT` configurada
  - [ ] URL pública accesible

- [ ] **Verificación en producción**
  - [ ] App carga en URL de Azure
  - [ ] Estilos se cargan correctamente
  - [ ] Imágenes visibles (si existen)
  - [ ] Formulario interactivo
  - [ ] Envío funciona

## ✅ Documentación

- [ ] **README.md** — Claro, completo, con Quick Start
- [ ] **docs/DEPLOYMENT_AZURE.md** — Paso a paso
- [ ] **docs/ASSETS_GUIDE.md** — Cómo reemplazar imágenes
- [ ] **docs/power-automate-flow.md** — Flujo detallado
- [ ] **docs/openapi.yaml** — Especificación OpenAPI
- [ ] **docs/postman_collection.json** — Tests Postman
- [ ] **docs/sharepoint_columns.csv** — Estructura SharePoint

## ✅ Performance & Seguridad

- [ ] **Performance**
  - [ ] Lighthouse score >= 90 en Performance
  - [ ] LCP (Largest Contentful Paint) < 2.5s
  - [ ] CLS (Cumulative Layout Shift) < 0.1
  - [ ] FID (First Input Delay) < 100ms

- [ ] **Seguridad**
  - [ ] No hay secrets en código (solo variables de entorno)
  - [ ] `.env` no está commiteado
  - [ ] Validación de entrada en el lado del cliente
  - [ ] HTTPS en Azure (automático)
  - [ ] CORS configurado en Power Automate si es necesario

## ✅ Mantenimiento & Escalabilidad

- [ ] **Código mantenible**
  - [ ] Componentes pequenos y reutilizables
  - [ ] Funciones de validación separadas
  - [ ] Estilos modulares (variables CSS)
  - [ ] Tests para lógica crítica

- [ ] **Escalabilidad**
  - [ ] Fácil añadir más pasos/campos
  - [ ] Validaciones son reutilizables
  - [ ] Estructura permite agregar más endpoints
  - [ ] Base para futuras integraciones (Power BI, Teams, etc.)

## 📋 Pasos finales antes de go-live

1. [ ] Ejecuta `npm test` — debe pasar 100%
2. [ ] Ejecuta `npm run build` — sin warnings
3. [ ] Verifica `dist/` contiene index.html y assets
4. [ ] Haz push a `main` en GitHub
5. [ ] Espera a que GitHub Actions complete
6. [ ] Verifica Azure Static Web Apps URL
7. [ ] Prueba desde móvil (iPhone + Android)
8. [ ] Completa formulario de prueba
9. [ ] Verifica que item aparece en SharePoint
10. [ ] Verifica que correo se recibe
11. [ ] Revisa logs sin errores
12. [ ] ¡Listo para producción!

## 🚨 Troubleshooting rápido

| Problema | Solución |
|----------|----------|
| Tests fallan | `npm install` y `npm test` de nuevo |
| Build falla | Verifica que no hay errores de sintaxis: `npm run build` |
| Imágenes no cargan | Verifica rutas en `src/assets/` — nombres sensibles a mayúsculas |
| Validación no funciona | Revisa `src/utils/validation.js` — importada correctamente en componentes |
| Envío no va a Power Automate | Verifica `VITE_POWER_AUTOMATE_ENDPOINT` en `.env` y en Azure |
| Azure no actualiza | Haz push a `main` y espera a que GitHub Actions complete |

---

**Cuando este checklist esté 100% completo, el proyecto está LISTO para producción.**
