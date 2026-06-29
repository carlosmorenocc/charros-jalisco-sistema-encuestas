# Cómo reemplazar los assets de la aplicación

Este documento explica cómo personalizar las imágenes de la landing.

## Ubicaciones de los assets

Todos los assets deben colocarse en la carpeta `src/assets/`. Los nombres de archivo usados en el código son:

### Nombres esperados en el código:
- `ch-logo.png` — Logo "Ch" blanco sobre fondo azul (usado en el hero, 80px de ancho)
- `stadium.jpg` — Foto del Estadio Panamericano lleno de noche (opcional, para futuras secciones)
- `mascota.png` — Mascota Charrito (opcional)
- `calendar-2026.png` — Calendario temporada 2026 (opcional)
- `calendar-2026-27.png` — Calendario temporada 2026-27 (opcional)

## Formato recomendado

| Asset | Formato | Tamaño | Notas |
|-------|---------|--------|-------|
| `ch-logo.png` | PNG con transparencia | 1024×1024px mín. | Será escalado por CSS a 80px |
| `stadium.jpg` | JPG o PNG | 1920×1080px | Comprimido para web (< 200KB) |
| `mascota.png` | PNG con transparencia | 512×512px | Ideal para tarjetas o viñetas |
| `calendar-*.png` | PNG | 1200×900px | Comprimido, respeta resolución original |

## Pasos para reemplazar

1. Guarda tus imágenes en la carpeta `src/assets/` con los nombres exactos indicados arriba.
2. (Opcional) Si los nombres o rutas cambian, actualiza las referencias en los componentes:
   - `src/components/Hero.jsx` línea ~6: `<img src="/assets/ch-logo.png" ...`
   - Busca `/assets/` en todos los archivos `.jsx` para encontrar referencias.

3. Reinicia la app en desarrollo:
   ```bash
   npm run dev
   ```

4. Los assets serán servidos automáticamente desde la carpeta `public/assets` después del build.

## Optimización para producción

Antes de desplegar a Azure Static Web Apps:

1. **Comprime las imágenes** usando herramientas como:
   - [TinyPNG](https://tinypng.com/) — PNG/JPG
   - [ImageMagick](https://imagemagick.org/) — CLI
   - [Squoosh](https://squoosh.app/) — Online

2. **Target**: Mantén cada imagen < 200KB. El logo puede estar < 50KB.

3. Valida que todas las imágenes están presentes antes de hacer push a GitHub.

## Construcción durante build

Vite copia automáticamente los assets de `src/assets/` a `dist/assets/` durante `npm run build`.

Si necesitas precargar imágenes en el navegador, añade etiquetas `<link rel="preload">` en `index.html`:

```html
<link rel="preload" as="image" href="/assets/ch-logo.png" />
<link rel="preload" as="image" href="/assets/stadium.jpg" />
```

## Solución de problemas

### Las imágenes no cargan localmente
- Verifica que el archivo esté en `src/assets/` con el nombre exacto (sensible a mayúsculas/minúsculas).
- Abre las DevTools (F12) → Network tab → comprueba que la request a `/assets/archivo.png` devuelve 200.
- Recarga la página (Ctrl+Shift+R en Windows/Linux, Cmd+Shift+R en Mac).

### Las imágenes no cargan después de desplegar
- Asegúrate de que los assets fueron incluidos en el push a GitHub.
- Verifica que Vite generó la carpeta `dist/assets/` correctamente: `ls dist/assets/`.
- En Azure Static Web Apps, confirma que el "Output location" en la configuración es `dist`.

## Extensión futura: Usar variables de entorno para URLs

Si prefieres servir imágenes desde un CDN externo (ej: Azure Blob Storage), reemplaza:

```jsx
<img src="/assets/ch-logo.png" />
```

por:

```jsx
<img src={`${import.meta.env.VITE_ASSETS_CDN_URL}/ch-logo.png`} />
```

Luego añade en `.env`:
```
VITE_ASSETS_CDN_URL=https://tucdn.blob.core.windows.net/assets
```
