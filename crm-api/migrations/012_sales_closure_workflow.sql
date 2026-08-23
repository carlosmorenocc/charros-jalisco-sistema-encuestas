ALTER TABLE sales
  ADD COLUMN external_order_number text,
  ADD COLUMN sale_type text CHECK (sale_type IN ('new','renewal'));

-- La migración controlada necesita completar las filas históricas. La
-- inmutabilidad se restablece antes de terminar la transacción.
DROP TRIGGER sales_immutable ON sales;

UPDATE sales s
SET external_order_number = COALESCE(
      (SELECT p.reference FROM payments p WHERE p.sale_id=s.id AND p.reference IS NOT NULL ORDER BY p.created_at LIMIT 1),
      substring(s.notes FROM 'BoletoMóvil orden ([^ ]+)'),
      'CRM-' || upper(substr(s.id::text,1,8))
    ),
    sale_type = CASE
      WHEN upper(COALESCE((SELECT si.product FROM sale_items si WHERE si.sale_id=s.id ORDER BY si.id LIMIT 1),'')) LIKE '%RENOV%'
        THEN 'renewal'
      ELSE 'new'
    END;

WITH duplicates AS (
  SELECT id, row_number() OVER (
    PARTITION BY season_code, upper(external_order_number)
    ORDER BY created_at, id
  ) AS occurrence
  FROM sales
  WHERE deleted_at IS NULL
)
UPDATE sales s
SET external_order_number = s.external_order_number || '-' || upper(substr(s.id::text,1,8))
FROM duplicates d
WHERE s.id=d.id AND d.occurrence > 1;

ALTER TABLE sales
  ALTER COLUMN external_order_number SET NOT NULL,
  ALTER COLUMN sale_type SET NOT NULL;

CREATE TRIGGER sales_immutable
BEFORE UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE UNIQUE INDEX sales_season_external_order_unique
  ON sales (season_code, upper(external_order_number))
  WHERE deleted_at IS NULL;
