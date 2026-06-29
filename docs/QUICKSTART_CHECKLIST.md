# ✨ QUICK START CHECKLIST

Usa estos pasos para validar que todo funciona en **5 minutos**.

## Paso 1: Instala y levanta la app (2 min)

```bash
# En la raíz del proyecto
npm install
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173) en tu navegador.

**¿Se ve bien?**
- [ ] Página carga sin errores
- [ ] Logo y título visibles
- [ ] Sección "Únete al Club más Charro"
- [ ] Botón "Siguiente" listo

## Paso 2: Prueba el formulario (2 min)

1. **Completa Step 1 (Datos de contacto)**
   - [ ] Nombre: "Test" (obligatorio)
   - [ ] Apellido: "User" (obligatorio)
   - [ ] Email: "test@example.com" (obligatorio + formato válido)
   - [ ] Teléfono: "3331234567" (opcional, pero si entras, debe ser >= 10 dígitos)
   - [ ] Edad: "25-34" (obligatorio)
   - [ ] Sexo: "Masculino" (obligatorio)
   - [ ] Municipio: "Guadalajara" (obligatorio)

   → Haz clic **"Siguiente →"**

2. **Avanza por los pasos**
   - [ ] Step 2 (Perfil): Selecciona cualquier opción en cada select
   - [ ] Step 3 (Experiencia): Marca algunos checkboxes y une una calificación
   - [ ] Step 4 (Club Charros): Responde los campos
   - [ ] Step 5 (Promociones): Completa los campos
   - [ ] Step 6 (Aviso de privacidad): **Lee el aviso y marca AMBOS checkboxes**

## Paso 3: Valida el envío (1 min)

Haz clic en **"Enviar mi respuesta"**

**Debería pasar una de estas cosas:**

### Opción A: Sin `.env` (mock submit) ✓ CORRECTO
- La página muestra "¡Gracias por ser parte de la familia Charros!"
- Abre DevTools (F12) → Console
- Deberías ver: `Mock payload: { timestamp: "...", nombre: "Test", ... }`
- [ ] Payload visible en consola

### Opción B: Con `.env` + Power Automate
- Misma pantalla de agradecimiento
- El formulario fue a tu endpoint Power Automate
- Revisa Power Automate para confirmar que el trigger se ejecutó

## Paso 4: Prueba validaciones (30 seg)

Recarga la página y deliberadamente deja campos en blanco:

1. **Intenta enviar sin llenar nombre**
   - [ ] Error rojo aparece: "El nombre es obligatorio."

2. **Intenta enviar con email inválido** (ej: "notanemail")
   - [ ] Error: "Ingresa un correo válido."

3. **Intenta enviar sin marcar privacidad** (último step)
   - [ ] Error: "Debes aceptar el Aviso de Privacidad para continuar."

## Paso 5: Verifica responsividad (30 seg)

1. En DevTools (F12), abre **Toggle device toolbar** (Ctrl+Shift+M)
2. Selecciona **iPhone 12** (390px)
3. [ ] Página se ve bien en móvil
4. [ ] Botones son clicables (no muy pequeños)
5. [ ] Texto legible (no overflow)

## Paso 6: Ejecuta tests (1 min)

```bash
npm test
```

**Debería ver:**
- [ ] ✓ validation.test.js — Todos los tests pasan
- [ ] ✓ FormField.test.jsx — Todos los tests pasan
- [ ] Sin errores

```bash
# Opcional: interfaz gráfica
npm test:ui
```

## Paso 7: Build y preview (1 min)

```bash
npm run build
```

**Debería ver:**
- [ ] `✓ 00 files` o similar (sin errores)
- [ ] Carpeta `dist/` creada

```bash
npm run preview
```

Abre la URL sugerida (típicamente [http://localhost:4173](http://localhost:4173))
- [ ] App funciona igual que en dev
- [ ] Estilos cargados correctamente

## 🎯 Si TODO está checked:

**¡Felicidades! El proyecto está 100% funcional.** 🎉

Próximos pasos:
1. Reemplaza los assets (logo, imágenes) siguiendo [docs/ASSETS_GUIDE.md](../docs/ASSETS_GUIDE.md)
2. Configura Power Automate siguiendo [docs/power-automate-flow.md](../docs/power-automate-flow.md)
3. Deploya en Azure siguiendo [docs/DEPLOYMENT_AZURE.md](../docs/DEPLOYMENT_AZURE.md)

## 🚨 Si algo NO funciona:

| Problema | Solución |
|----------|----------|
| `npm install` falla | Usa Node 16+: `node --version`. Si no, instala desde nodejs.org |
| `npm run dev` no abre navegador | Abre manualmente http://localhost:5173 |
| Formulario no renderiza | Abre DevTools (F12) → Console y busca errores rojos |
| Validaciones no funcionan | Verifica que `src/utils/validation.js` existe |
| Tests fallan | `npm install` de nuevo y luego `npm test` |
| Build falla | Busca errores en la salida, típicamente sintaxis JS |

---

**Tiempo total:** ~5 minutos ⏱️

¿Preguntas? Revisa [README.md](../README.md) o la documentación en `docs/`.
