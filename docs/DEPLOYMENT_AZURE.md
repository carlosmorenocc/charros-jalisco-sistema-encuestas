# Guía de despliegue: Azure Static Web Apps

Este documento proporciona un paso a paso para desplegar la aplicación en Azure Static Web Apps.

## Prerrequisitos

- Repositorio público o privado en GitHub (con el código de la aplicación)
- Cuenta de Azure con crédito/suscripción activa
- Git instalado en tu máquina

## Paso 1: Prepara el repositorio en GitHub

### 1.1 Crea un repositorio en GitHub

1. Ve a [github.com](https://github.com)
2. Haz clic en "New" para crear un repositorio nuevo
3. Nombre: `charros-jalisco-sistema-encuestas` (o tu preferencia)
4. Selecciona "Public" o "Private"
5. NO inicialices con README, .gitignore ni license (vamos a pushear código existente)
6. Clic en "Create repository"

### 1.2 Pushea el código local

En tu máquina, dentro de la carpeta del proyecto:

```bash
# Inicializa git (si no lo has hecho)
git init

# Añade el repositorio remoto (reemplaza USERNAME y REPO con tus valores)
git remote add origin https://github.com/USERNAME/REPO.git

# Verifica que esté correcto
git remote -v

# Crea un archivo .gitignore (si no existe)
# Copia el contenido típico de un proyecto Node.js
cat > .gitignore << EOF
node_modules/
dist/
.env
.DS_Store
*.log
.vite/
EOF

# Añade los archivos
git add .

# Primer commit
git commit -m "Initial commit: Encuesta Oficial Charros 2026-2027"

# Push a main branch
git branch -M main
git push -u origin main
```

## Paso 2: Crea un recurso en Azure Static Web Apps

### 2.1 Acceso a Azure Portal

1. Ve a [portal.azure.com](https://portal.azure.com)
2. Inicia sesión con tu cuenta de Azure
3. En la barra de búsqueda superior, escribe "Static Web Apps" y selecciona el servicio

### 2.2 Crea una nueva Static Web App

1. Haz clic en "+ Create"
2. Completa el formulario:
   - **Subscription**: Selecciona tu suscripción
   - **Resource group**: Crea uno nuevo, ej: `charros-jalisco-rg`
   - **Name**: `charros-survey-landing` (o tu preferencia)
   - **Plan type**: Free (para desarrollo/pruebas)
   - **Region**: West US 2 o la más cercana a Jalisco

3. Haz clic en "Next: Deployment details >"

### 2.3 Conecta con GitHub

1. **Source**: Selecciona "GitHub"
2. Haz clic en "Sign in with GitHub" (autoriza la aplicación Azure en GitHub)
3. Completa los campos:
   - **Organization**: Tu organización o username en GitHub
   - **Repository**: Selecciona `charros-jalisco-sistema-encuestas`
   - **Branch**: Selecciona `main`
4. Haz clic en "Next: Build >"

### 2.4 Configura el Build

1. **Build presets**: Selecciona "Vite"
2. **App location**: `/` (la raíz del repo)
3. **Build output location**: `dist`
4. **API location**: Deja vacío (no tenemos API serverless)
5. Haz clic en "Review + create"

### 2.5 Revisa y confirma

1. Revisa que todos los datos sean correctos
2. Haz clic en "Create"
3. Espera a que Azure cree el recurso (2-3 minutos)

## Paso 3: Obtén el token de despliegue

1. Una vez que el recurso esté listo, entra en el recurso de "Static Web Apps"
2. En el menú izquierdo, haz clic en "Configuration"
3. En la sección "Production environment", verifica los valores:
   - **App location**: `/`
   - **Output location**: `dist`
4. Copia la URL de la aplicación (algo como `https://charros-survey-landing-abc123.azurestaticapps.net`)

## Paso 4: Añade variables de entorno en Azure

1. En el recurso Static Web Apps, ve a **Configuration** → **Environment variables**
2. Haz clic en "+ Add"
3. Añade la variable `VITE_POWER_AUTOMATE_ENDPOINT`:
   - **Name**: `VITE_POWER_AUTOMATE_ENDPOINT`
   - **Value**: La URL de tu flujo de Power Automate (HTTP trigger)
4. Haz clic en "OK"

## Paso 5: Verifica el despliegue automático

1. Desde tu máquina, haz un pequeño cambio y push a GitHub:
   ```bash
   git add .
   git commit -m "Test deployment"
   git push
   ```

2. En Azure, ve a **Actions** en el menú izquierdo
3. Verás un flujo en ejecución (GitHub Actions)
4. Espera a que termine (2-5 minutos)
5. Si es exitoso, la URL de tu app será accesible

## Paso 6: Verifica la aplicación

1. Abre la URL de Azure Static Web Apps (copiada en Paso 3)
2. Verifica:
   - ✓ La página carga y se ve bien
   - ✓ El formulario es interactivo
   - ✓ Respeta mobile-first (abre desde un móvil o emulador)
   - ✓ El botón "Enviar" funciona y envía a Power Automate

## Paso 7: Configuración de dominio personalizado (opcional)

Si deseas usar un dominio personalizado (ej: `encuesta.charrosjalisco.com`):

1. En Azure Static Web Apps, ve a **Custom domains**
2. Haz clic en "+ Add"
3. Ingresa el dominio (ej: `encuesta.charrosjalisco.com`)
4. Valida la propiedad del dominio siguiendo las instrucciones de Azure (típicamente mediante TXT o CNAME en tu proveedor de DNS)
5. Confirma y espera la propagación de DNS (puede tomar 24h)

## Troubleshooting

### El build falla con error "npm: not found"
- Verifica que el archivo `.github/workflows/azure-static-web-apps.yml` esté presente y correcto
- Azure debería crear este archivo automáticamente durante la creación del recurso
- Si no está, descárgalo desde `/.github/workflows/azure-static-web-apps.yml` en el repo

### La aplicación no muestra los estilos
- Limpia caché del navegador (Ctrl+Shift+Delete)
- Verifica que el build fue exitoso (sin errores en la salida de GitHub Actions)
- Abre DevTools → Network tab y verifica que `index.css` se cargó (status 200)

### Las imágenes no cargan en producción
- Verifica que los assets están en `src/assets/` con el nombre exacto
- Asegúrate de que fueron incluidos en el push a GitHub
- Ejecuta `npm run build` localmente y verifica que `dist/assets/` contiene tus imágenes
- Si está bien localmente, fuerza un nuevo despliegue desde Azure (rebuid)

### El formulario no envía a Power Automate
- Verifica que `VITE_POWER_AUTOMATE_ENDPOINT` está configurada en Azure
- Comprueba que la URL del endpoint es correcta (cópiala del trigger HTTP en Power Automate)
- Prueba el endpoint con Postman antes (ver `docs/postman_collection.json`)
- Revisa los logs en Power Automate para detectar fallos

## Monitoreo y logs

1. En Azure Static Web Apps, ve a **Monitoring** → **Application Insights** (si lo habilitaste)
2. Ve a **Deployments** para ver el historial de despliegues
3. Haz clic en cualquier despliegue para ver los logs de build

## Despliegues futuros

Después de este primer despliegue, cada push a la rama `main` en GitHub activará automáticamente un nuevo build y despliegue (CI/CD). Solo necesitas:

```bash
git add .
git commit -m "Descripción del cambio"
git push origin main
```

Y Azure construirá y desplegará automáticamente en 2-5 minutos.

---

**¡Listo!** Tu aplicación está desplegada y accesible en Azure Static Web Apps. 

Cualquier duda, contáctame o revisa la documentación oficial: https://learn.microsoft.com/azure/static-web-apps/
