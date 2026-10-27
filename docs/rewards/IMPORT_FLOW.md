# Flujo de importación de asistencias

1. El administrador descarga de Boleto Móvil el reporte detallado del partido.
2. En `Importar`, selecciona explícitamente el juego y si el corte es parcial o cerrado.
3. El navegador envía el Excel para previsualización; todavía no se escribe información.
4. El API normaliza encabezados y construye la llave orden + zona + sección + asiento.
5. Se separan filas incluidas, excluidas, duplicadas y por revisar.
6. Al confirmar, el API guarda el hash del archivo y las nuevas asistencias dentro de una transacción.
7. La restricción programa + juego impide sumar dos veces una misma butaca.

La interfaz operativa acepta únicamente reportes de asistencia. El parser de padrón permanece como herramienta técnica para conciliaciones controladas, no como opción cotidiana.

No se deben contar suites, compromisos, patrocinios, colaborador ni modalidades excluidas del padrón aprobado.
