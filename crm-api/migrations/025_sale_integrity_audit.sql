-- Read-only operational audit. It reports discrepancies and never repairs data.
CREATE OR REPLACE VIEW sale_integrity_audit AS
WITH holder_totals AS (
  SELECT ha.sale_id,count(*)::integer AS holder_count,
    count(*) FILTER (WHERE ha.is_primary)::integer AS primary_holder_count,
    COALESCE(sum(ha.quantity),0)::integer AS assigned_quantity
  FROM sale_holder_assignments ha WHERE ha.deleted_at IS NULL GROUP BY ha.sale_id
), seat_totals AS (
  SELECT ha.sale_id,count(su.id)::integer AS seat_unit_count
  FROM sale_holder_assignments ha
  LEFT JOIN sale_seat_units su ON su.holder_assignment_id=ha.id AND su.deleted_at IS NULL
  WHERE ha.deleted_at IS NULL GROUP BY ha.sale_id
), item_totals AS (
  SELECT es.id AS sale_id,
    COALESCE(sum((item->>'quantity')::integer) FILTER (
      WHERE lower(COALESCE(item->>'product','')) NOT LIKE '%estacionamiento%'
        AND lower(COALESCE(item->>'zone','')) NOT LIKE '%estacionamiento%'
    ),0)::integer AS sold_quantity
  FROM effective_sales es
  LEFT JOIN LATERAL jsonb_array_elements(es.effective_items) item ON true
  WHERE es.deleted_at IS NULL GROUP BY es.id
), payment_totals AS (
  SELECT p.sale_id,
    COALESCE(sum(p.amount + COALESCE(adjustments.amount,0)),0)::numeric AS paid_amount
  FROM payments p
  LEFT JOIN LATERAL (
    SELECT sum(pa.amount) AS amount FROM payment_adjustments pa WHERE pa.payment_id=p.id
  ) adjustments ON true
  WHERE p.voided_at IS NULL GROUP BY p.sale_id
)
SELECT es.id AS sale_id,es.effective_external_order_number AS order_number,
  es.season_code,es.effective_status AS status,
  COALESCE(items.sold_quantity,0) AS sold_quantity,
  COALESCE(holders.assigned_quantity,0) AS assigned_quantity,
  COALESCE(seats.seat_unit_count,0) AS seat_unit_count,
  COALESCE(holders.holder_count,0) AS holder_count,
  COALESCE(holders.primary_holder_count,0) AS primary_holder_count,
  es.effective_total_amount AS total_amount,
  COALESCE(payments.paid_amount,0) AS paid_amount,
  array_remove(ARRAY[
    CASE WHEN COALESCE(holders.holder_count,0)=0 THEN 'missing_holder' END,
    CASE WHEN COALESCE(holders.primary_holder_count,0)<>1 THEN 'invalid_primary_holder_count' END,
    CASE WHEN COALESCE(items.sold_quantity,0)<>COALESCE(holders.assigned_quantity,0)
      THEN 'holder_quantity_mismatch' END,
    CASE WHEN COALESCE(holders.assigned_quantity,0)<>COALESCE(seats.seat_unit_count,0)
      THEN 'seat_unit_mismatch' END,
    CASE WHEN terms.sale_id IS NULL THEN 'missing_commercial_terms' END,
    CASE WHEN COALESCE(payments.paid_amount,0)>es.effective_total_amount THEN 'overpaid' END
  ],NULL) AS issues
FROM effective_sales es
LEFT JOIN holder_totals holders ON holders.sale_id=es.id
LEFT JOIN seat_totals seats ON seats.sale_id=es.id
LEFT JOIN item_totals items ON items.sale_id=es.id
LEFT JOIN payment_totals payments ON payments.sale_id=es.id
LEFT JOIN sale_commercial_terms terms ON terms.sale_id=es.id
WHERE es.deleted_at IS NULL;

COMMENT ON VIEW sale_integrity_audit IS
  'Read-only discrepancies between effective orders, holders, seats, terms and payments.';
