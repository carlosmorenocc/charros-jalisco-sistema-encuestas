# 🎯 PRÓXIMOS PASOS

Guía concreta para llevar el proyecto desde dev a producción.

---

## HORA 0: AHORA (15 minutos)

### 1. Valida que todo funciona
```bash
npm install
npm run dev
```
Sigue: [docs/QUICKSTART_CHECKLIST.md](QUICKSTART_CHECKLIST.md) (5 min)

**Resultado esperado:** App funciona en http://localhost:5173

### 2. Ejecuta los tests
```bash
npm test
```

**Resultado esperado:** Todos los tests pasan ✅

### 3. Crea el build
```bash
npm run build
```

**Resultado esperado:** Carpeta `dist/` creada sin errores

---

## HORA 1: PERSONALIZACIÓN (30 minutos)

### 4. Reemplaza las imágenes
Sigue: [docs/ASSETS_GUIDE.md](ASSETS_GUIDE.md)

**Archivos a reemplazar:**
- `src/assets/ch-logo.png` → Tu logo (1024×1024px)
- `src/assets/stadium.jpg` → Foto del estadio (1920×1080px)
- `src/assets/mascota.png` → Mascota (512×512px, opcional)

**Resultado:** App con tu branding

### 5. Personaliza la privacidad y enlaces
En [src/components/ThankYou.jsx](../src/components/ThankYou.jsx):
- Cambia URLs de boletos, tienda, email según tus datos

En [src/components/PrivacyConsent.jsx](../src/components/PrivacyConsent.jsx):
- Verifica el link de aviso de privacidad

**Resultado:** Links y contactos correctos

---

## HORA 2: POWER AUTOMATE (45 minutos)

### 6. Crea el flujo en Power Automate
Sigue: [docs/power-automate-flow.md](power-automate-flow.md)

**Pasos:**
1. Ir a https://make.powerautomate.com
2. Crear nuevo flujo "Cloud flow" → "Automated"
3. Seleccionar trigger "When an HTTP request is received"
4. Copiar el URL del trigger (esta es tu `VITE_POWER_AUTOMATE_ENDPOINT`)
5. Configurar Parse JSON con el schema del request
6. Crear "Create item" en SharePoint List
7. Configurar "Send an email" en Outlook
8. Guardar y probar

**Plantilla disponible:** [docs/power-automate-sample-flow.json](power-automate-sample-flow.json) (importa en Power Automate)

### 7. Crea la SharePoint List
Pasos:
1. En https://sharepoint.com, crear nueva lista
2. Importar columnas de: [docs/sharepoint_columns.csv](sharepoint_columns.csv)
3. O crear manualmente 30+ columnas (nombre, email, teléfono, etc.)

**Referencia:** CSV contiene nombre y tipo de cada columna

### 8. Configura la variable de entorno
```bash
# Copia el .env
cp .env.example .env

# Edita .env
# VITE_POWER_AUTOMATE_ENDPOINT=https://prod-XX.logic.azure.com:443/workflows/XXXX/triggers/manual/invoke?api-version=2022-05-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=XXXXX
```

**Reemplaza con:** La URL que copiaste del trigger Power Automate

### 9. Prueba localmente con Power Automate
```bash
npm run dev
```

Completa el formulario y envía. Deberías ver:
- [ ] Flujo Power Automate se ejecuta (verifica en Power Automate → Mis flujos)
- [ ] Item aparece en SharePoint List
- [ ] Email se recibe en Outlook

**Debugging:** Abre DevTools (F12) → Network y busca el POST para ver la respuesta

---

## HORA 3: DESPLIEGUE EN AZURE (1 hora)

### 10. Sube el código a GitHub
```bash
git add .
git commit -m "Initial commit: Encuesta Charros v0.1.0"
git push origin main
```

**Verificar:** Código visible en https://github.com/tuusuario/charros-jalisco-sistema-encuestas

### 11. Crea Static Web App en Azure
Sigue: [docs/DEPLOYMENT_AZURE.md](DEPLOYMENT_AZURE.md) (paso a paso completo)

**Resumen rápido:**
1. Azure Portal → Static Web Apps → Create
2. Conectar GitHub (autorizar y seleccionar repo)
3. Configurar:
   - App location: `/`
   - Output location: `dist`
   - API location: (dejar en blanco)
4. Crear

**Resultado:** URL tipo `https://graceful-stone-0XXX.azurestaticapps.net`

### 12. Configura variables de entorno en Azure
En Azure Portal → tu Static Web App → Settings → Configuration:
- Añade: `VITE_POWER_AUTOMATE_ENDPOINT` con tu URL

### 13. Deploy automático
El primer deployment se ejecuta automáticamente. Espera 2-5 minutos.

Verifica:
- [ ] GitHub Actions workflow completó (check verde)
- [ ] Azure Static Web App muestra estado "Ready"
- [ ] URL pública accesible
- [ ] App funciona en la URL pública

**Debugging:** Si falla, ve a Azure Portal → Deployment details para ver logs

---

## HORA 4: VALIDACIÓN PRE-PRODUCCIÓN (30 minutos)

### 14. Completa el checklist de validación
Sigue: [docs/VALIDATION_CHECKLIST.md](VALIDATION_CHECKLIST.md)

Todos los puntos deben estar ✅

### 15. Prueba en diferentes navegadores
- [ ] Chrome (Windows, Mac, mobile)
- [ ] Safari (Mac, iPhone)
- [ ] Firefox (Windows, Mac)
- [ ] Edge (Windows)

### 16. Prueba en diferentes conexiones
- [ ] WiFi rápida (simula office)
- [ ] 4G (simula móvil)
- [ ] Throttle 3G (DevTools → Network → Throttling)

### 17. Prueba el flujo completo
1. Abre app en móvil
2. Rellena todos los campos
3. Envía
4. Verifica:
   - [ ] Thank you screen aparece
   - [ ] Item en SharePoint List
   - [ ] Email en Outlook
   - [ ] Power Automate run history exitoso

---

## 🎉 GO LIVE (cuando todo esté listo)

### Checklist final antes de lanzar
- [ ] Todos los tests pasan
- [ ] Build sin errores/warnings
- [ ] Azure deploy exitoso
- [ ] Pruebas end-to-end completadas
- [ ] Assets personalizados
- [ ] Validación checklist 100%
- [ ] URLs de privacidad, boletos, tienda correctas
- [ ] Email de soporte configurado

### Comunicación
1. **Envía el link:** `https://tu-app.azurestaticapps.net`
2. **Instrucciones:** Sigue el formulario, responde las 6 preguntas
3. **Share:** Redes sociales, email, web

---

## 📋 TIMELINE RECOMENDADO

| Fase | Tiempo | Pasos |
|------|--------|-------|
| Validación local | 15 min | 1-3 |
| Personalización | 30 min | 4-5 |
| Power Automate | 45 min | 6-9 |
| Azure Deploy | 1 hora | 10-13 |
| Validación | 30 min | 14-17 |
| **TOTAL** | **~3 horas** | |

---

## 🚨 TROUBLESHOOTING COMÚN

### Build falla
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Tests fallan
```bash
npm test -- --reporter=verbose
```
Revisa el error, típicamente es import o ruta incorrecta.

### Power Automate no recibe datos
1. Verifica `VITE_POWER_AUTOMATE_ENDPOINT` en `.env`
2. Abre DevTools (F12) → Console y busca errores rojos
3. En Network, busca el POST y revisa la respuesta
4. En Power Automate, ve a "My flows" y revisa el run history para detalles del error

### Azure no actualiza después de push
1. Espera 2-5 minutos (deployment tarda)
2. Ve a Azure Portal → GitHub Actions → busca el workflow
3. Si está rojo, abre y lee los logs de error
4. Típicamente es un error de build (revisa `npm run build` localmente)

### Formulario no valida
Abre DevTools (F12) → Console:
- Busca mensajes rojos o amarillos
- Típicamente es que `FormField` no importa `validation` correctamente

---

## 📞 SOPORTE

| Problema | Dónde buscar |
|----------|-------------|
| Cómo configurar Power Automate | [power-automate-flow.md](power-automate-flow.md) |
| Cómo desplegar en Azure | [DEPLOYMENT_AZURE.md](DEPLOYMENT_AZURE.md) |
| Cómo reemplazar imágenes | [ASSETS_GUIDE.md](ASSETS_GUIDE.md) |
| Campos del formulario | [README.md](../README.md) → Datos capturados |
| Validaciones | [src/utils/validation.js](../src/utils/validation.js) |
| Tests | [src/tests/](../src/tests/) |

---

## ✨ DESPUÉS DEL LANZAMIENTO

### Semana 1 (Monitoreo)
- [ ] Revisa los primeros datos en SharePoint
- [ ] Verifica emails de notificación
- [ ] Busca errores en Power Automate runs
- [ ] Recibe feedback inicial

### Semana 2-3 (Mejoras)
- [ ] Aumentar tráfico (publicidad)
- [ ] Monitorear performance (Azure Application Insights)
- [ ] Ajustar campos según feedback
- [ ] Posible A/B testing

### Mes 2 (Análisis)
- [ ] Power BI dashboard
- [ ] Reporte a directivos
- [ ] Decisión de siguientes fases

---

**Estado: LISTO PARA COMENZAR** ✅

Empieza por el Paso 1 y sigue la lista. ¡Buena suerte! 🚀
