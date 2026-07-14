# 📚 Índice de documentación

Navega fácilmente por toda la documentación del proyecto.

---

## 🚀 COMIENZA AQUÍ

**Eres nuevo en el proyecto?** Sigue este orden:

1. **[README.md](../README.md)** ← Qué es esto, quick start
2. **[docs/QUICKSTART_CHECKLIST.md](QUICKSTART_CHECKLIST.md)** ← Valida en 5 minutos que funciona
3. **[docs/NEXT_STEPS.md](NEXT_STEPS.md)** ← Qué hacer después (guía paso a paso)

---

## 📋 DOCUMENTACIÓN POR TIPO

### Para tu primer deployment (ESENCIAL)

| Documento | Para qué | Tiempo |
|-----------|----------|--------|
| [QUICKSTART_CHECKLIST.md](QUICKSTART_CHECKLIST.md) | Valida que todo funciona localmente | 5 min |
| [NEXT_STEPS.md](NEXT_STEPS.md) | Guía completa desarrollo → producción | 3-5 horas |
| [DEPLOYMENT_AZURE.md](DEPLOYMENT_AZURE.md) | Despliegue detallado en Azure | 1 hora |
| [power-automate-flow.md](power-automate-flow.md) | Configurar envío de datos | 45 min |
| [ASSETS_GUIDE.md](ASSETS_GUIDE.md) | Personalizar imágenes | 15 min |
| [VALIDATION_CHECKLIST.md](VALIDATION_CHECKLIST.md) | Checklist pre-producción | 30 min |

### Para mantenimiento y referencia

| Documento | Para qué |
|-----------|----------|
| [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) | Estado del proyecto, estadísticas, estructura |
| [CHANGELOG.md](CHANGELOG.md) | Historial de versiones y cambios |

### Para integraciones y desarrollo

| Documento | Para qué |
|-----------|----------|
| [openapi.yaml](openapi.yaml) | Especificación técnica del endpoint |
| [postman_collection.json](postman_collection.json) | Tests HTTP listos para Postman |
| [power-automate-sample-flow.json](power-automate-sample-flow.json) | Plantilla Power Automate (importar) |
| [sharepoint_columns.csv](sharepoint_columns.csv) | Columnas de la SharePoint List |

---

## 🗂️ ESTRUCTURA DEL PROYECTO

```
charros-jalisco-sistema-encuestas/
│
├── README.md
│   └── Visión general, tech stack, quick start
│
├── src/
│   ├── components/ ← Componentes React
│   ├── steps/ ← Los 5 pasos del formulario
│   ├── services/ ← submitForm.js (envía datos)
│   ├── utils/ ← validation.js (validaciones)
│   ├── data/ ← questions.js (opciones de select)
│   ├── styles/ ← index.css (estilos)
│   └── tests/ ← Tests unitarios
│
├── docs/ ← Esta carpeta
│   ├── 📌 INDEX.md ← Estás aquí
│   ├── 📌 README.md ← Visión general proyecto
│   ├── QUICKSTART_CHECKLIST.md ← Valida local (5 min)
│   ├── NEXT_STEPS.md ← Acciones concretas
│   ├── VALIDATION_CHECKLIST.md ← Pre-producción
│   ├── PROJECT_SUMMARY.md ← Resumen ejecutivo
│   ├── CHANGELOG.md ← Historial de versiones
│   ├── DEPLOYMENT_AZURE.md ← Despliegue Azure
│   ├── ASSETS_GUIDE.md ← Personalizar imágenes
│   ├── power-automate-flow.md ← Configuración PA
│   ├── power-automate-sample-flow.json ← Plantilla
│   ├── sharepoint_columns.csv ← Columnas SharePoint
│   ├── openapi.yaml ← Especificación técnica
│   └── postman_collection.json ← Tests HTTP
│
├── .github/workflows/ ← Despliegue automático
│
├── .env.example ← Variables de entorno
│
└── package.json, vite.config.js, index.html, etc.
```

---

## 🎯 POR SITUACIÓN

### Situación: "Acabo de bajar el código, ¿qué hago?"
1. Abre [QUICKSTART_CHECKLIST.md](QUICKSTART_CHECKLIST.md)
2. Sigue los 7 pasos (5 minutos)
3. Si todo funciona ✅, continúa a [NEXT_STEPS.md](NEXT_STEPS.md)

### Situación: "Quiero desplegar en Azure"
1. Lee [NEXT_STEPS.md](NEXT_STEPS.md) → HORA 3 (sección "DESPLIEGUE EN AZURE")
2. Sigue paso a paso [DEPLOYMENT_AZURE.md](DEPLOYMENT_AZURE.md)

### Situación: "Necesito configurar Power Automate"
1. Lee [NEXT_STEPS.md](NEXT_STEPS.md) → HORA 2 (sección "POWER AUTOMATE")
2. Sigue [power-automate-flow.md](power-automate-flow.md)
3. Importa plantilla: [power-automate-sample-flow.json](power-automate-sample-flow.json)

### Situación: "Quiero cambiar el logo y las imágenes"
→ Ve a [ASSETS_GUIDE.md](ASSETS_GUIDE.md)

### Situación: "¿Qué campos captura exactamente?"
→ Lee [README.md](../README.md) → "Datos capturados"
→ O ve [sharepoint_columns.csv](sharepoint_columns.csv) para detalles

### Situación: "Antes de lanzar a producción, ¿qué debo verificar?"
→ Completa [VALIDATION_CHECKLIST.md](VALIDATION_CHECKLIST.md) (todoslos puntos deben estar ✅)

### Situación: "Tengo un error, ¿qué hago?"
1. Busca en [QUICKSTART_CHECKLIST.md](QUICKSTART_CHECKLIST.md) → "Si algo NO funciona"
2. O en [NEXT_STEPS.md](NEXT_STEPS.md) → "TROUBLESHOOTING COMÚN"
3. Abre DevTools (F12) y revisa Console para errores

### Situación: "Quiero saber el estado del proyecto"
→ Lee [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)

### Situación: "¿Qué cambios se han hecho en cada versión?"
→ Ve [CHANGELOG.md](CHANGELOG.md)

---

## 🔍 BÚSQUEDA RÁPIDA

### Por palabra clave

**"validación"**
- [src/utils/validation.js](../src/utils/validation.js) — Código
- [src/utils/validation.test.js](../src/utils/validation.test.js) — Tests
- [VALIDATION_CHECKLIST.md](VALIDATION_CHECKLIST.md) — Checklist

**"imágenes"**
- [ASSETS_GUIDE.md](ASSETS_GUIDE.md) — Cómo cambiarlas

**"Power Automate"**
- [power-automate-flow.md](power-automate-flow.md) — Configuración
- [power-automate-sample-flow.json](power-automate-sample-flow.json) — Plantilla
- [NEXT_STEPS.md](NEXT_STEPS.md) → "HORA 2: POWER AUTOMATE"

**"Azure"**
- [DEPLOYMENT_AZURE.md](DEPLOYMENT_AZURE.md) — Despliegue
- [NEXT_STEPS.md](NEXT_STEPS.md) → "HORA 3: DESPLIEGUE EN AZURE"

**"SharePoint"**
- [sharepoint_columns.csv](sharepoint_columns.csv) — Columnas
- [power-automate-flow.md](power-automate-flow.md) → "Crear item en SharePoint"

**"tests"**
- [src/utils/validation.test.js](../src/utils/validation.test.js)
- [src/components/FormField.test.jsx](../src/components/FormField.test.jsx)
- [QUICKSTART_CHECKLIST.md](QUICKSTART_CHECKLIST.md) → "Paso 6: Ejecuta tests"

**"mobile"**
- [QUICKSTART_CHECKLIST.md](QUICKSTART_CHECKLIST.md) → "Paso 5: Verifica responsividad"
- [VALIDATION_CHECKLIST.md](VALIDATION_CHECKLIST.md) → "Mobile-first"

**"errores"**
- [NEXT_STEPS.md](NEXT_STEPS.md) → "TROUBLESHOOTING COMÚN"
- [QUICKSTART_CHECKLIST.md](QUICKSTART_CHECKLIST.md) → "Si algo NO funciona"

---

## ⏱️ CRONOGRAMA

### Día 1 (Dev local)
- [ ] **15 min:** [QUICKSTART_CHECKLIST.md](QUICKSTART_CHECKLIST.md) — Valida que funciona
- [ ] **30 min:** [ASSETS_GUIDE.md](ASSETS_GUIDE.md) — Personaliza logo
- [ ] **45 min:** [power-automate-flow.md](power-automate-flow.md) — Configura PA

### Día 2 (Despliegue)
- [ ] **1 hora:** [DEPLOYMENT_AZURE.md](DEPLOYMENT_AZURE.md) — Deploy en Azure
- [ ] **30 min:** [VALIDATION_CHECKLIST.md](VALIDATION_CHECKLIST.md) — Valida TODO

### Día 3+ (Mantenimiento)
- [ ] Monitorear datos en SharePoint
- [ ] Revisar emails en Outlook
- [ ] Contar respuestas, feedback inicial

---

## 📞 REFERENCIA RÁPIDA

```
npm install                    # Instala dependencias
npm run dev                    # Desarrollo local (http://localhost:5173)
npm test                       # Ejecuta tests
npm run build                  # Build producción (dist/)
npm run preview               # Previsualiza build

# Con .env configurado:
VITE_POWER_AUTOMATE_ENDPOINT=https://...tu-endpoint
```

**Más detalles:** [README.md](../README.md)

---

## 🎯 CHECKLIST: LISTO PARA PRODUCCIÓN

- [ ] Leí [README.md](../README.md)
- [ ] Completé [QUICKSTART_CHECKLIST.md](QUICKSTART_CHECKLIST.md)
- [ ] Personalicé assets en [ASSETS_GUIDE.md](ASSETS_GUIDE.md)
- [ ] Configuré Power Automate en [power-automate-flow.md](power-automate-flow.md)
- [ ] Deployé en Azure en [DEPLOYMENT_AZURE.md](DEPLOYMENT_AZURE.md)
- [ ] Completé [VALIDATION_CHECKLIST.md](VALIDATION_CHECKLIST.md)
- [ ] Probé end-to-end (formulario → SharePoint → Email)
- [ ] Probé en móvil
- [ ] Revisé logs sin errores

---

## 🚀 ¡LISTO!

Cuando todos los checkboxes arriba están ✅, tu app está **LISTA PARA PRODUCCIÓN**.

Sigue [NEXT_STEPS.md](NEXT_STEPS.md) para el paso a paso completo.

---

**Último actualizado:** Junio 26, 2026  
**Versión:** 0.1.0  
**Estado:** Documentación COMPLETA ✅
