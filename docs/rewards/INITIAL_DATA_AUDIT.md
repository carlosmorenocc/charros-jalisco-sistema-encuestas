# Auditoría de archivos iniciales — 24 de octubre de 2026

Los archivos se leyeron localmente; no fueron copiados ni añadidos a Git.

| Fuente | Resultado comprobado |
| --- | ---: |
| Padrón de órdenes | 616 combinaciones únicas orden + zona + sección + asiento |
| Acceso 13/10 | 504 programas únicos |
| Acceso 20/10 | 387 programas únicos |
| Acceso 21/10, archivo nuevo 00:22 | 334 programas únicos |
| Acceso 22/10 | 429 programas únicos |

El control proporcionado indicaba 307 para el 21/10. El nuevo archivo contiene 334: son 27 accesos únicos más y todos coinciden con el padrón. Debe conservarse el corte y hash de cada importación para que ambas cifras sean explicables.

Hay 10 filas de zona `SUITES` dentro de uno de los cuatro eventos de abono permitidos. Excluirlas reduce el padrón a 606 y contradice el control de 616. Se clasifican como revisión administrativa, igual que modalidades `$0`, `$1.00` y `Abono Colaborador`; no se decide automáticamente su elegibilidad.
