-- El campo RECIBIDO del reporte detallado es la fuente para cobranza. Estas
-- órdenes existen, pero el corte 00:49 no documenta todavía dinero recibido.
-- Se conserva el movimiento importado como anulado para mantener trazabilidad.
UPDATE payments p
SET voided_at = COALESCE(p.voided_at, now()),
    void_reason = COALESCE(p.void_reason, 'Conciliación con RECIBIDO · Reporte 2026-08-23 00:49')
FROM sales s
WHERE p.sale_id = s.id
  AND p.voided_at IS NULL
  AND s.external_ref IN (
    '15391893', '15380359', '15380215', '15380060', '15379738', '15376573',
    '15365366', '15340821', '15243415', '15232256', '15206115', '15177665',
    '15177456', '15168145', '15157532', '15157211', '15157101', '15155902',
    '15096881', '15091399', '15043331', '14965101', '14965054', '14958975',
    '14958270', '14957727', '14952023', '14938841', '14881406', '14877084',
    '14855945', '14827323', '14773734', '14756063', '14733454', '14732465',
    '14726691', '14726162', '14724753', '14719217', '14688242', '14687820',
    '14650880', '14649235', '14641237', '14629894', '14629818'
  );

