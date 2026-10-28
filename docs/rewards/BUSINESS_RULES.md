# Reglas de negocio

## Temporada

- Temporada: `LMP-2026-27`.
- Alcance: 34 juegos de temporada regular como local, del 13 de octubre al 30 de diciembre de 2026.
- Playoffs no incluidos.
- Cada abono/butaca constituye un programa independiente.
- Una butaca puede sumar como máximo una asistencia por partido, aunque el archivo contenga escaneos repetidos.
- Cuando existen varios escaneos de la misma butaca en un partido, se conserva el primero cronológicamente. Esto cubre el segundo control de acceso de la zona VIP sin duplicar la visita.
- Boleto Móvil es la fuente autoritativa para orden, zona, sección y asiento. Las discrepancias del padrón se corrigen con trazabilidad y los cambios históricos se enlazan mediante aliases explícitos.

| Serie como local | Fechas de 2026 |
|---|---|
| Jaguares de Nayarit | 13 oct; 20–22 nov |
| Mayos de Navojoa | 20–22 oct; 10–12 nov |
| Cañeros de Los Mochis | 27–29 oct |
| Algodoneros de Guasave | 3–5 nov |
| Venados de Mazatlán | 27–29 nov; 21–23 dic |
| Tomateros de Culiacán | 4–6 dic |
| Yaquis de Obregón | 11–13 dic |
| Naranjeros de Hermosillo | 18–20 dic |
| Águilas de Mexicali | 28–30 dic |

## Segmentación

El segmento se persiste en PostgreSQL; el frontend no vuelve a inferirlo.

| Segmento | Zonas y alias aceptados |
|---|---|
| VIP | VIP; VIP Lateral |
| Preferente | Premier/Premiere 1ra–3ra; Planta Baja Central; Lateral Premier/Premiere 1ra–3ra; Butaca Preferente 1ra–3ra; Planta Baja 1ra–3ra |
| General | Lateral Preferente 1ra–3ra; Lateral 1ra–3ra; Planta Alta; Planta Alta 1ra–3ra |

`Lateral Preferente` pertenece a **General**, conforme al material oficial.

## Excepción cerrada de elegibilidad

Existe una sola clase de excepción operativa para una cortesía de abono de giveaway autorizada. La autorización pertenece a una butaca/programa específico y se persiste mediante el valor cerrado `authorized_giveaway_courtesy`; no habilita por categoría a otras cortesías, compromisos ni filas semejantes.

- La fila de acceso solo puede usar la excepción cuando coincide de forma exacta con el programa autorizado por orden, zona, sección y asiento.
- El tipo debe ser exactamente `Cortesía abono`, el producto debe corresponder al compromiso autorizado, el patrocinador debe estar vacío y la ubicación no puede ser una suite.
- Una coincidencia por alias, equivalencia de zona, orden + asiento, nombre, correo, teléfono o cualquier estrategia de respaldo no puede activar la excepción.
- Patrocinios, suites, otros compromisos y cualquier fila no exacta siguen excluidos, aunque apunten al mismo titular.
- El programa conserva las mismas reglas de asistencia única por partido, hitos, canje `N + 1` y trazabilidad que el resto del padrón.

Toda nueva excepción requiere una decisión de negocio explícita, una revisión de código y una ampliación deliberada de la lista cerrada. Nunca se autoriza mediante texto libre ni ampliando globalmente los eventos excluidos.

## Hitos y canje

Existen 15 hitos pares: 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28 y 30.

- El hito `N` se alcanza al registrar `N` asistencias.
- Se habilita para entrega desde la asistencia `N + 1`. Ejemplo: el hito 2 puede canjearse cuando ya existen 3 asistencias conciliadas.
- La regla `N + 1` también aplica a correcciones o entregas históricas; ningún cliente de la API puede anticipar un canje.
- Una entrega activa sombrea el hito.
- Toda nueva entrega debe registrar el nombre de la persona que recibe el beneficio. Puede ser el titular de la butaca o una persona autorizada por él.
- La fecha y hora de entrega las asigna el servidor al confirmar; el cliente no puede modificarlas. También se conserva la cuenta institucional que realizó el registro.
- Un segundo clic confirmado revierte la entrega de forma lógica y conserva actor, fecha y motivo en la trazabilidad.
- Una corrección no elimina la entrega original. El historial muestra tanto la entrega corregida como una eventual entrega posterior, cada una con destinatario, fecha y actor propios.
- Administrador y usuarios de consulta pueden registrar o corregir entregas.

## Catálogo

| Hito | Beneficio |
|---:|---|
| 2 | Cerveza doble de cortesía |
| 4 | Dos cervezas Charros Brew en concesión |
| 6 | Destilado de cortesía |
| 8 | 20% de descuento en Charros Team Store |
| 10 | Acceso a práctica de bateo |
| 12 | Pase doble a Zona Grill |
| 14 | Visita guiada al Estadio Panamericano |
| 16 | Pase doble a juego para dos invitados |
| 18 | Invitado especial en CharrosTV |
| 20 | Sorteo de bat de colección usado en juego |
| 22 | Pelota oficial autografiada |
| 24 | 35% de descuento en el próximo abono |
| 26 | Jersey firmado por jugadores |
| 28 | Lanzamiento de primera bola grupal |
| 30 | Convivencia en Zona Grill con jugadores y asado |

El único beneficio sujeto a sorteo es el hito 20; el hito 18 es una entrega directa.
