-- Contact-level commercial classification is a convenient operational summary.
-- The sale/order remains the source of truth and may carry more than one facet.
ALTER TABLE contacts
  ADD COLUMN commercial_segment text
    CHECK (commercial_segment IN ('VIP','Preferente','General','Compromisos')),
  ADD COLUMN suite_number text
    CHECK (suite_number IS NULL OR char_length(trim(suite_number)) BETWEEN 1 AND 40),
  ADD CONSTRAINT contacts_suite_segment_consistent CHECK (
    commercial_segment='Compromisos' OR suite_number IS NULL
  );

ALTER TABLE sale_commercial_terms
  ADD COLUMN parking_quantity integer NOT NULL DEFAULT 0
    CHECK (parking_quantity BETWEEN 0 AND 100);

-- Recover the latest known commercial section for existing holders. Suite
-- identity is copied only when it was explicitly preserved on the order.
WITH latest_order AS (
  SELECT DISTINCT ON (ha.contact_id)
    ha.contact_id,ha.segment,terms.suite_number
  FROM sale_holder_assignments ha
  JOIN effective_sales es ON es.id=ha.sale_id
  LEFT JOIN sale_commercial_terms terms ON terms.sale_id=ha.sale_id
  WHERE ha.deleted_at IS NULL AND es.deleted_at IS NULL
    AND es.effective_status IN ('confirmed','reserved')
  ORDER BY ha.contact_id,es.effective_sold_at DESC NULLS LAST,es.id DESC
)
UPDATE contacts c
SET commercial_segment=latest_order.segment,
    suite_number=CASE WHEN latest_order.segment='Compromisos' THEN latest_order.suite_number END
FROM latest_order
WHERE c.id=latest_order.contact_id AND c.deleted_at IS NULL;

-- Parking was historically free text. Only exact, auditable item names are
-- backfilled; no quantity is inferred from notes.
UPDATE sale_commercial_terms terms
SET parking_quantity=parking.quantity
FROM (
  SELECT es.id,
    COALESCE(sum((item->>'quantity')::integer) FILTER (
      WHERE lower(COALESCE(item->>'product','')) LIKE '%estacionamiento%'
    ),0)::integer AS quantity
  FROM effective_sales es
  CROSS JOIN LATERAL jsonb_array_elements(es.effective_items) item
  WHERE es.deleted_at IS NULL
  GROUP BY es.id
) parking
WHERE terms.sale_id=parking.id AND parking.quantity>0;

COMMENT ON COLUMN contacts.commercial_segment IS
  'Latest operational sale segment; order items remain the reporting source of truth.';
COMMENT ON COLUMN contacts.suite_number IS
  'Latest explicitly assigned suite for quick contact operations.';
COMMENT ON COLUMN sale_commercial_terms.parking_quantity IS
  'Season parking places attached to the sale at the server-controlled unit price.';
