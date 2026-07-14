# CHANGELOG

Todas las versiones y cambios del proyecto "Encuesta Oficial Charros 2026-2027".

## [0.1.0] - 2026-06-26 (Initial Release)

### ✨ Características agregadas

**Scaffold & Setup**
- React 18 + Vite 5 configurado
- Vite config con React plugin
- Entry point (index.html, main.jsx, App.jsx)

**Componentes principales**
- `Hero.jsx` — Bienvenida con logo, slogan y descripción
- `ProgressBar.jsx` — Barra de progreso visual
- `MultiStepForm.jsx` — Contenedor principal, orquestación de pasos
- `FormField.jsx` — Componente reutilizable con validación en vivo
- `PrivacyConsent.jsx` — Paso de privacidad (obligatorio + opt-in)
- `ThankYou.jsx` — Pantalla de agradecimiento post-envío

**Steps del formulario (6 pasos)**
- `StepContact.jsx` — Datos de contacto (nombre, apellido, email, teléfono, edad, sexo, municipio)
- `StepFanProfile.jsx` — Perfil del aficionado (relación, antigüedad, acompañantes, motivación)
- `StepExperience.jsx` — Experiencia en estadio (calificación, checkboxes limitadas, consumo)
- `StepClubCharros.jsx` — Club Charros (interés, razones, beneficios, probabilidad)
- `StepPromotions.jsx` — Promociones (canales, tipos de info, comentarios)

**Validación y utilidades**
- `src/utils/validation.js` — Sistema robusto de validaciones con reglas reutilizables
  - Email validation
  - Phone formatting y validation
  - Min/max length
  - Required fields
  - Step-based validation rules
- `src/data/questions.js` — Listas reutilizables (rangos edad, géneros, etc.)

**Servicios**
- `src/services/submitForm.js` — Envío HTTP a Power Automate
  - Mock submit fallback para desarrollo local
  - Manejo de errores y payload robusto
  - Prevención de doble envío

**Estilos**
- `src/styles/index.css` — CSS moderno, mobile-first, institucional
  - Variables CSS (colores Charros: azul, oro, rojo)
  - Diseño responsive (320px, 640px, 768px+)
  - Form fields con validación visual
  - Botones y accesibilidad

**Testing**
- `vitest.config.js` — Configuración Vitest + React Testing Library
- `src/tests/setup.js` — Setup de tests
- `src/utils/validation.test.js` — Tests unitarios para validación
- `src/components/FormField.test.jsx` — Tests para componente FormField

**Configuración**
- `package.json` — Scripts: dev, build, preview, test, test:ui
- `vite.config.js` — Vite config con React plugin
- `.env.example` — Variables de entorno recomendadas
- `.github/workflows/azure-static-web-apps.yml` — CI/CD workflow

**Documentación**
- `README.md` — Documentación principal (Quick Start, estructura, features)
- `docs/power-automate-flow.md` — Guía detallada del flujo (trigger, Parse JSON, Create item, etc.)
- `docs/power-automate-sample-flow.json` — Plantilla orientativa del flujo
- `docs/sharepoint_columns.csv` — Especificación de columnas SharePoint
- `docs/openapi.yaml` — Especificación OpenAPI del endpoint POST
- `docs/postman_collection.json` — Colección Postman para pruebas
- `docs/DEPLOYMENT_AZURE.md` — Guía paso a paso para Azure Static Web Apps
- `docs/ASSETS_GUIDE.md` — Cómo personalizar imágenes
- `docs/VALIDATION_CHECKLIST.md` — Checklist de validación final

### 🎯 Funcionalidades clave

✓ Multi-step form con 6 pasos + privacy  
✓ Validaciones robustas con mensajes en vivo  
✓ Diseño mobile-first y responsivo  
✓ Integración con Power Automate (HTTP trigger)  
✓ SharePoint List listo para capturar datos  
✓ Correo automático vía Outlook  
✓ Mock submit para pruebas sin endpoint  
✓ Tests unitarios para validación  
✓ Estilos modernos e institucionales  
✓ Barra de progreso  
✓ Prevención de doble envío  
✓ Payload completo + timestamp  

### 🔧 Stack técnico

- Frontend: React 18 + Vite 5
- Estilos: CSS3 moderno (variables, flexbox, grid)
- Validaciones: Sistema custom reutilizable
- Testing: Vitest + React Testing Library
- Hosting: Azure Static Web Apps
- Backend: Power Automate + SharePoint + Outlook

### 📦 Archivos generados

```
src/
├── components/          # 9 componentes React
├── steps/              # 5 steps del formulario
├── services/           # submitForm.js
├── utils/              # validation.js
├── data/               # questions.js
├── styles/             # index.css (completo)
├── tests/              # setup.js + tests
├── App.jsx
└── main.jsx

docs/
├── power-automate-flow.md
├── power-automate-sample-flow.json
├── sharepoint_columns.csv
├── openapi.yaml
├── postman_collection.json
├── DEPLOYMENT_AZURE.md
├── ASSETS_GUIDE.md
├── VALIDATION_CHECKLIST.md
└── CHANGELOG.md

.github/workflows/
└── azure-static-web-apps.yml

public/
└── assets/            # Placeholder para imágenes

.env.example
vite.config.js
vitest.config.js
package.json
index.html
README.md
```

### 🚀 Próximas versiones sugeridas

**v0.2.0 — Optimización & Testing**
- Aumentar cobertura de tests
- Performance optimizations (code splitting)
- PWA features (service worker, manifest)

**v0.3.0 — Integraciones avanzadas**
- Power BI dataset refresh trigger
- Microsoft Teams notifications
- SMS via Twilio
- Webhook para CRM

**v1.0.0 — Producción completa**
- Multi-idioma (español, inglés)
- Analytics & heatmaps
- A/B testing
- Customizable surveys (drag & drop builder)

### 📋 Notas de implementación

- **Mobile-first:** Todas las resoluciones testeadas desde 320px
- **Accesibilidad:** Labels, aria-invalid, keyboard navigation
- **Performance:** Vite optimiza automáticamente
- **Seguridad:** Secrets solo en variables de entorno, validación en cliente
- **Escalabilidad:** Componentes modulares, lógica reutilizable

---

**Versión actual:** 0.1.0  
**Fecha de release:** 26 de junio, 2026  
**Estado:** Beta (listo para testing)
