-- A sale must be reproducible without parsing display labels. Holder assignments
-- are the source of truth for ownership; these columns preserve the commercial
-- selection that was applied when the order was saved.
ALTER TABLE sale_commercial_terms
  ADD COLUMN price_book_version text REFERENCES membership_price_books(version),
  ADD COLUMN section text CHECK (section IS NULL OR section IN ('VIP','Preferente','General')),
  ADD COLUMN locality_code text,
  ADD COLUMN locality_name text,
  ADD COLUMN discount_code text,
  ADD COLUMN discount_name text,
  ADD COLUMN pricing_mode text;

-- Backfill only exact catalog matches and explicit discount markers. Ambiguous
-- legacy rows remain NULL so the CRM never invents a commercial condition.
WITH inferred AS (
  SELECT es.id,
    pb.version AS price_book_version,
    lp.section,lp.code AS locality_code,lp.display_name AS locality_name,
    dc.code AS discount_code,dc.display_name AS discount_name,
    CASE WHEN upper(items.product_text) LIKE '%2X1%' THEN 'two_for_one'
      WHEN dc.mode='regular' THEN 'regular'
      WHEN dc.mode='percentage' THEN 'percentage'
      WHEN dc.mode='catalog_official' THEN lp.july25_mode END AS pricing_mode
  FROM effective_sales es
  LEFT JOIN membership_price_books pb
    ON pb.season_code=es.season_code AND pb.active=true
  LEFT JOIN LATERAL (
    SELECT min(item->>'zone') AS zone_name,
      string_agg(COALESCE(item->>'product',''),' ') AS product_text,
      (regexp_match(string_agg(COALESCE(item->>'product',''),' '),'DESCUENTO .* \[([^]]+)\]','i'))[1] AS discount_code
    FROM jsonb_array_elements(es.effective_items) item
    WHERE lower(COALESCE(item->>'product','')) NOT LIKE '%estacionamiento%'
  ) items ON true
  LEFT JOIN membership_locality_prices lp
    ON lp.price_book_version=pb.version AND lower(lp.display_name)=lower(items.zone_name)
  LEFT JOIN membership_discount_campaigns dc
    ON dc.price_book_version=pb.version AND dc.code=items.discount_code
  WHERE es.deleted_at IS NULL
)
UPDATE sale_commercial_terms terms
SET price_book_version=inferred.price_book_version,
    section=inferred.section,locality_code=inferred.locality_code,
    locality_name=inferred.locality_name,discount_code=inferred.discount_code,
    discount_name=inferred.discount_name,pricing_mode=inferred.pricing_mode
FROM inferred WHERE inferred.id=terms.sale_id;

-- Preserve an auditable correction whenever the legacy sale contact differs
-- from the currently designated primary holder. The immutable correction log
-- remains intact and effective_sales immediately resolves to the right person.
INSERT INTO sale_corrections
  (sale_id,external_order_number,sale_type,contact_id,executive_id,status,
   sold_at,total_amount,notes,items,reason,created_by)
SELECT es.id,es.effective_external_order_number,es.effective_sale_type,
  primary_holder.contact_id,es.effective_executive_id,es.effective_status,
  es.effective_sold_at,es.effective_total_amount,es.effective_notes,
  es.effective_items,
  'Sincronización del contacto principal con el titular conciliado de la orden.',
  es.updated_by
FROM effective_sales es
JOIN LATERAL (
  SELECT ha.contact_id FROM sale_holder_assignments ha
  WHERE ha.sale_id=es.id AND ha.deleted_at IS NULL
  ORDER BY ha.is_primary DESC,ha.created_at,ha.id LIMIT 1
) primary_holder ON true
WHERE es.deleted_at IS NULL AND es.effective_contact_id<>primary_holder.contact_id;

COMMENT ON COLUMN sale_commercial_terms.locality_code IS
  'Structured locality selected for the sale; NULL means the legacy value requires audit.';
COMMENT ON COLUMN sale_commercial_terms.discount_code IS
  'Structured discount selected for the sale; never inferred when the legacy source is ambiguous.';
