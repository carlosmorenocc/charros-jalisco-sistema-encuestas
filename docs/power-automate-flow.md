Power Automate — Flujo sugerido para recibir respuestas de la landing
===============================================================

Resumen
-------
Flujo recomendado (simple y robusto):

1. Trigger: "When an HTTP request is received" (HTTP POST)
2. Action: Parse JSON (schema basado en el payload de la app)
3. Action: Create item (SharePoint - crear fila en SharePoint List)
4. Action: Send an email (Office 365 Outlook - notificación interna / agradecimiento opcional)
5. Action: (Opcional) Refresh Power BI dataset / enviar a Teams
6. Action: Response (200 OK)

Nota: La app usa la variable de entorno `VITE_POWER_AUTOMATE_ENDPOINT` que debe apuntar a la URL del trigger HTTP.

1) Crear la SharePoint List
---------------------------
Recomiendo crear una lista con columnas (Internal Name sugerido entre paréntesis):

- Title (Title) — puede ser `nombre apellido`.
- Timestamp (Timestamp) — DateTime
- CampaignName (CampaignName) — Single line
- Source (Source)
- Nombre (Nombre)
- Apellido (Apellido)
- Email (Email)
- Telefono (Telefono)
- RangoEdad (RangoEdad)
- Sexo (Sexo)
- Municipio (Municipio)
- RelacionCharros (RelacionCharros)
- Antiguedad (Antiguedad)
- Acompanantes (Acompanantes)
- Motivacion (Motivacion)
- CalificacionExperiencia (CalificacionExperiencia)
- AspectosDisfrutados (AspectosDisfrutados) — Multiple lines or Choice (coma-separado)
- AspectosMejorar (AspectosMejorar)
- ConsumoEstadio (ConsumoEstadio)
- InteresClubCharros (InteresClubCharros)
- RazonAbonado (RazonAbonado)
- RazonNoRenovo (RazonNoRenovo)
- BarreraCompra (BarreraCompra)
- BeneficioPreferido (BeneficioPreferido)
- ProbabilidadCompra (ProbabilidadCompra)
- CanalPromociones (CanalPromociones)
- TipoInformacion (TipoInformacion)
- Comentario (Comentario)
- AceptaAvisoPrivacidad (AceptaAvisoPrivacidad) — Yes/No
- AceptaComunicaciones (AceptaComunicaciones) — Yes/No

2) Trigger: When an HTTP request is received
-------------------------------------------
- Tipo: POST
- En "Use sample payload to generate schema" pega el siguiente ejemplo (JSON):

```json
{
  "timestamp":"2026-06-26T12:00:00Z",
  "campaignName":"Encuesta Oficial Charros 2026-2027",
  "source":"landing",
  "nombre":"Juan",
  "apellido":"Pérez",
  "email":"juan@example.com",
  "telefono":"3331234567",
  "rangoEdad":"25-34",
  "sexo":"Masculino",
  "municipio":"Guadalajara",
  "relacionCharros":"serie",
  "antiguedad":"1-3",
  "acompanantes":"Familia",
  "motivacion":"Me gusta el ambiente",
  "calificacionExperiencia":"5",
  "aspectosDisfrutados":["Ambiente","Juego"],
  "aspectosMejorar":["Baños","Limpieza"],
  "consumoEstadio":"MyCashless",
  "interesClubCharros":"si",
  "razonAbonado":[],
  "razonNoRenovo":"Precio",
  "barreraCompra":[],
  "beneficioPreferido":[],
  "probabilidadCompra":"8",
  "canalPromociones":["Instagram"],
  "tipoInformacion":["Promociones","Preventas"],
  "comentario":"Todo excelente",
  "aceptaAvisoPrivacidad":true,
  "aceptaComunicaciones":true
}
```

Esto generará el esquema JSON que usarás en el paso "Parse JSON".

3) Action: Parse JSON
----------------------
Usa el contenido del trigger (body) y el schema generado arriba. Esto te permitirá mapear cada propiedad con seguridad.

4) Action: Create item (SharePoint)
-----------------------------------
Mapea las salidas de "Parse JSON" a las columnas de la lista. Ejemplo de mapeo:

- Title = concat(parsed.nombre, ' ', parsed.apellido)
- Timestamp = parsed.timestamp
- CampaignName = parsed.campaignName
- Source = parsed.source
- Nombre = parsed.nombre
- Apellido = parsed.apellido
- Email = parsed.email
- Telefono = parsed.telefono
- RangoEdad = parsed.rangoEdad
- Sexo = parsed.sexo
- Municipio = parsed.municipio
- RelacionCharros = parsed.relacionCharros
- Antiguedad = parsed.antiguedad
- Acompanantes = parsed.acompanantes
- Motivacion = parsed.motivacion
- CalificacionExperiencia = parsed.calificacionExperiencia
- AspectosDisfrutados = join(parsed.aspectosDisfrutados, ', ')
- AspectosMejorar = join(parsed.aspectosMejorar, ', ')
- ConsumoEstadio = parsed.consumoEstadio
- InteresClubCharros = parsed.interesClubCharros
- RazonAbonado = join(parsed.razonAbonado, ', ')
- RazonNoRenovo = parsed.razonNoRenovo
- BarreraCompra = join(parsed.barreraCompra, ', ')
- BeneficioPreferido = join(parsed.beneficioPreferido, ', ')
- ProbabilidadCompra = parsed.probabilidadCompra
- CanalPromociones = join(parsed.canalPromociones, ', ')
- TipoInformacion = join(parsed.tipoInformacion, ', ')
- Comentario = parsed.comentario
- AceptaAvisoPrivacidad = parsed.aceptaAvisoPrivacidad
- AceptaComunicaciones = parsed.aceptaComunicaciones

5) Action: Send an email (Office 365 Outlook) — opcional
-------------------------------------------------------
Puedes notificar internamente a Marketing/Abonados con un correo que incluya: nombre, email, resumen de respuestas y un link a la lista de SharePoint o al caso en CRM.

Ejemplo de asunto: "Nueva respuesta encuesta — {Nombre} {Apellido}"

Cuerpo (HTML): incluye las propiedades parseadas. Ejemplo:

```
Se recibió una nueva respuesta.
Nombre: @{body('Parse_JSON')?['nombre']} @{body('Parse_JSON')?['apellido']}
Email: @{body('Parse_JSON')?['email']}
Calificación experiencia: @{body('Parse_JSON')?['calificacionExperiencia']}
Comentarios: @{body('Parse_JSON')?['comentario']}
```

6) Acción final: Response
-------------------------
Devuelve `200 OK` con un pequeño JSON de confirmación para que la landing detecte envío exitoso.

Pruebas locales (curl)
----------------------
Si tu flujo ya tiene la URL (copiada desde el trigger), prueba con curl:

```bash
curl -X POST '<FLOW_HTTP_TRIGGER_URL>' \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Test","apellido":"User","email":"test@example.com","municipio":"Guadalajara","aceptaAvisoPrivacidad":true}'
```

Consejos
--------
- Habilita la validación de esquema en "Parse JSON" para capturar problemas de payload.
- Añade una condición para ignorar envíos sin `aceptaAvisoPrivacidad`.
- Considera filtrar duplicados por `email` o `timestamp` si tu lógica de negocio lo requiere.
- Para reporting: configura un dataset en Power BI que cargue desde la SharePoint List o desde una tabla en Dataverse.

Si quieres, genero también el archivo `power-automate-sample-flow.json` con una estructura exportable del flujo (plantilla), y un `.csv` sugerido para crear la SharePoint List (cabeceras).¿Lo genero ahora? 
