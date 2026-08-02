# Encuesta Oficial Charros 2026-2027

Landing page oficial para capturar opiniones y datos de aficionados de Charros de Jalisco. Primera versión de la plataforma interna de inteligencia del aficionado.

**Slogan:** "Únete al Club más Charro"

## 🎯 Características principales

- ✓ Multi-step form (6 pasos + privacy)
- ✓ Validaciones robustas con mensajes en vivo
- ✓ Diseño mobile-first, responsivo y profesional
- ✓ Integración con Power Automate (HTTP trigger)
- ✓ SharePoint List para almacenamiento
- ✓ Correo automático Outlook
- ✓ Mock submit para pruebas locales
- ✓ Tests unitarios incluidos

## 🚀 Quick Start

### 1. Instala dependencias
```bash
npm install
```

### 2. Desarrollo local
```bash
npm run server
npm run dev
```
Abre [http://localhost:5173](http://localhost:5173)

Encuesta de leads en estadio (versión corta de 3 ventanas):

[http://localhost:5173/leads](http://localhost:5173/leads)

Con esto, cada respuesta se almacena automáticamente en:

`data/submissions.csv`

Y los leads de estadio en:

`data/submissions_leads.csv`

Los registros de abonados LMP 2026-2027 se guardan de forma independiente en:

`data/submissions_abonados_lmp_2026_2027.csv`

Las descargas de encuesta general y leads requieren
`Authorization: Bearer <CSV_EXPORT_TOKEN>`. La descarga de abonados usa un secreto
independiente: `Authorization: Bearer <ABONADOS_CSV_EXPORT_TOKEN>`. Cada exportación
queda cerrada con `503` cuando su token correspondiente no está configurado.

Encuesta general:

`http://localhost:3001/api/submissions.csv`

Y para leads:

`http://localhost:3001/api/leads-submissions.csv`

Y para abonados:

`http://localhost:3001/api/abonados-lmp-submissions.csv`

### 3. Configura Power Automate (opcional)
Copia `.env.example` a `.env` y añade tu endpoint:
```
VITE_POWER_AUTOMATE_ENDPOINT=https://prod-XX...tu-flow-http-trigger-url
```

## 📁 Estructura del proyecto

```
src/
├── components/       # Componentes React
│   ├── Hero.jsx
│   ├── MultiStepForm.jsx
│   ├── FormField.jsx
│   ├── ProgressBar.jsx
│   ├── PrivacyConsent.jsx
│   ├── ThankYou.jsx
│   └── steps/       # Pasos del formulario
├── services/
│   └── submitForm.js
├── utils/
│   └── validation.js
├── data/
│   └── questions.js
├── styles/
│   └── index.css
├── tests/
│   └── *.test.js
└── main.jsx

docs/
├── power-automate-flow.md
├── DEPLOYMENT_AZURE.md
├── ASSETS_GUIDE.md
└── ...
```

## 🛠 Stack técnico

- **Frontend:** React 18 + Vite 5
- **Estilos:** CSS3 moderno (mobile-first)
- **Validaciones:** Custom con reglas reutilizables
- **Testing:** Vitest + React Testing Library
- **Hosting:** Azure Static Web Apps
- **Backend:** Power Automate + SharePoint + Outlook

## 📋 Pasos de la encuesta (3 minutos)

1. **Datos de contacto** — nombre, apellido, email, teléfono, edad, sexo, municipio
2. **Perfil del aficionado** — relación, antigüedad, acompañantes, motivación
3. **Experiencia en estadio** — calificación, aspectos, consumo
4. **Club Charros** — interés, barreras, beneficios, probabilidad
5. **Promociones** — canales, tipos de información
6. **Aviso de privacidad** — consentimiento obligatorio + opt-in

## ✅ Validaciones

- Email válido
- Campos requeridos
- Teléfono mín. 10 dígitos
- Privacidad obligatoria

## 🧪 Testing

```bash
npm test              # Tests unitarios
npm run test:backend  # Integración del almacenamiento seguro de abonados
npm test:ui          # Con interfaz
```

## 📦 Build y Producción

```bash
npm run build        # Optimizado
npm run preview      # Vista previa
```

## 🗄 Almacenamiento CSV automático

- La API de captura está en `server.js`.
- Endpoint de escritura: `POST /api/submit`.
- Endpoint de descarga: `GET /api/submissions.csv`.
- Endpoint de escritura (leads): `POST /api/lead-submit`.
- Endpoint de descarga (leads): `GET /api/leads-submissions.csv`.
- Endpoint de escritura (abonados): `POST /api/abonados-lmp-submit`.
- Endpoint de descarga protegida (abonados): `GET /api/abonados-lmp-submissions.csv`.
- En desarrollo, el frontend usa por defecto `http://localhost:3001/api/submit` si no defines otro endpoint.

### Regla especial para encuesta de leads

- Un mismo correo solo puede registrar **1 lead por día** (bloqueo en backend).
- Puede volver a registrarse en otro juego al día siguiente.

### Registro de abonados LMP 2026-2027

- Se habilita de manera independiente con `SUBSCRIBER_FORM_ENABLED=true`.
- Admite de `1` a `20` abonos y exige exactamente una talla por cada abono.
- Admite exclusivamente las tallas `S`, `M`, `L`, `XL` y `2XL`.
- Exige que `aceptaAvisoPrivacidad` sea el booleano `true`.
- Guarda nombre, apellido, correo, teléfono, cantidad de abonos, hasta 20 tallas nuevas y consentimientos en un CSV propio.
- El servidor genera el identificador, fecha, campaña, origen y metadatos del aviso; ignora esos valores si llegan desde el cliente.
- Solo permite un registro por correo normalizado para toda la campaña y reconstruye esta deduplicación desde el CSV al reiniciar.
- Confirma `201 Created` únicamente después de que la fila fue escrita.

Payload público:

```json
{
  "nombre": "Ana",
  "apellido": "Charra",
  "email": "ana@example.com",
  "telefono": "3312345678",
  "cantidadAbonos": 2,
  "tallasJersey": ["M", "XL"],
  "aceptaAvisoPrivacidad": true,
  "aceptaComunicaciones": false
}
```

El CSV independiente usa columnas planas compatibles con Excel:
`cantidadAbonos`, `tallaJersey1`, ..., `tallaJersey25`. Las cinco columnas finales
se conservan únicamente por compatibilidad con registros históricos; las nuevas
capturas aceptan como máximo 20 abonos. Al iniciar por primera vez
con un CSV anterior que solo contenía `tallaJersey`, el backend crea un respaldo
en el mismo directorio y migra cada talla a `tallaJersey1`. `cantidadAbonos` queda
vacío en esas filas históricas porque ese dato no fue recopilado. La migración es
idempotente y conserva la deduplicación por correo tras reinicios.

El despliegue debe ser **backend primero**. La compatibilidad temporal permite que
el frontend anterior siga enviando `tallaJersey`; esas filas también conservan
`cantidadAbonos` vacío. Después de migrar el CSV, el rollback seguro es solo del
frontend. No reviertas el backend a una versión anterior: la migración de datos es
forward-only. Para una recuperación excepcional del backend, detén la escritura y
restaura conscientemente el archivo de respaldo antes de arrancar la versión antigua.

### Seguridad de exportaciones CSV

Configura un secreto largo y aleatorio en el backend:

```text
CSV_EXPORT_TOKEN=<secreto-aleatorio>
ABONADOS_CSV_EXPORT_TOKEN=<otro-secreto-aleatorio>
```

No uses el prefijo `VITE_` ni expongas este valor en Vercel o en el código del navegador.
`CSV_EXPORT_TOKEN` protege las exportaciones de encuesta general y leads;
`ABONADOS_CSV_EXPORT_TOKEN` protege exclusivamente la exportación de abonados.
Usa secretos distintos para mantener la separación de privilegios. Ejemplo local:

```bash
curl -H "Authorization: Bearer $ABONADOS_CSV_EXPORT_TOKEN" \
  http://localhost:3001/api/abonados-lmp-submissions.csv
```

`ALLOWED_ORIGINS` debe listar el dominio exacto del frontend, pero CORS no reemplaza
la autenticación de las exportaciones. En Render, `CSV_DATA_DIR` debe apuntar a un
disco persistente.

### Producción recomendada

1. Despliega el frontend en Vercel (como hoy).
2. Despliega `server.js` en un servicio Node dedicado (Render/Railway/Fly.io) para tener escritura persistente de CSV.
3. Configura en Vercel la variable:

`VITE_SUBMISSION_ENDPOINT=https://TU-API/api/submit`

Para la encuesta corta de leads (ruta `/leads`), define también:

`VITE_LEADS_SUBMISSION_ENDPOINT=https://TU-API/api/lead-submit`

Para la encuesta temporal de abonados, configura en Vercel:

```text
VITE_SUBSCRIBER_FORM_ENABLED=true
VITE_ABONADOS_SUBMISSION_ENDPOINT=https://TU-API/api/abonados-lmp-submit
```

Y en el backend de Render:

```text
SUBSCRIBER_FORM_ENABLED=true
CSV_EXPORT_TOKEN=<secreto-largo-y-aleatorio>
ABONADOS_CSV_EXPORT_TOKEN=<otro-secreto-largo-y-aleatorio>
```

Esto evita que las respuestas se queden solo en `localStorage` y garantiza guardado centralizado.

## 🔗 Integración Power Automate

1. Lee: [docs/power-automate-flow.md](docs/power-automate-flow.md)
2. Plantilla: [docs/power-automate-sample-flow.json](docs/power-automate-sample-flow.json)
3. SharePoint: [docs/sharepoint_columns.csv](docs/sharepoint_columns.csv)
4. Prueba: [docs/postman_collection.json](docs/postman_collection.json)

## ☁️ Despliegue en Azure Static Web Apps

**Guía completa:** [docs/DEPLOYMENT_AZURE.md](docs/DEPLOYMENT_AZURE.md)

Resumen:
1. Push a GitHub
2. Crea Static Web App en Azure Portal
3. Conecta con GitHub
4. Auto-deploy en cada push
5. ¡Listo!

## 🎨 Imágenes y Assets

Guía: [docs/ASSETS_GUIDE.md](docs/ASSETS_GUIDE.md)

Coloca archivos en `src/assets/`:
- `ch-logo.png` — Logo (usado en hero)
- `stadium.jpg` — Estadio
- `mascota.png` — Mascota
- `calendar-2026*.png` — Calendarios

## 🔗 Enlaces

- Aviso: https://www.charrosjalisco.com/aviso-de-privacidad
- Boletos: https://boletomovil.com/charros-jalisco
- Tienda: https://tiendacharrosjalisco.com/
- Email: carlos.moreno@charrosjalisco.com

## 📊 Datos capturados

Payload completo: ver `src/services/submitForm.js`

```json
{
  "timestamp": "ISO 8601",
  "nombre": "string",
  "email": "string",
  "aceptaAvisoPrivacidad": true,
  "aceptaComunicaciones": true,
  ...
}
```

## ✨ Checklist final

- [ ] `npm test` pasa
- [ ] `npm run build` exitoso
- [ ] Assets en `src/assets/`
- [ ] `.env` configurado
- [ ] Power Automate funciona
- [ ] Mobile-friendly (DevTools)
- [ ] GitHub Actions OK
- [ ] Azure desplegado

## 📚 Documentación

- [Validación](src/utils/validation.js)
- [OpenAPI](docs/openapi.yaml)
- [Power Automate](docs/power-automate-flow.md)
- [Azure Deploy](docs/DEPLOYMENT_AZURE.md)
- [Assets](docs/ASSETS_GUIDE.md)

---

**v0.1.0** | Junio 2026 | Charros de Jalisco
