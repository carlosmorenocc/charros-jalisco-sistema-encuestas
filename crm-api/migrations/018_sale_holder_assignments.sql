-- A sale/order remains the accounting document. Holder assignments describe who
-- owns each subscription unit without duplicating the sale or its payments.
CREATE TABLE sale_holder_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  segment text NOT NULL CHECK (segment IN ('Compromisos','VIP','Preferente','General')),
  zone text,
  seat_identifiers text[] NOT NULL DEFAULT '{}'::text[],
  source text NOT NULL DEFAULT 'crm' CHECK (source IN ('crm','boletomovil','migration')),
  source_holder_name text,
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES app_users(id),
  updated_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES app_users(id),
  row_version integer NOT NULL DEFAULT 1,
  CHECK (cardinality(seat_identifiers) IN (0, quantity))
);

CREATE UNIQUE INDEX sale_holder_assignments_primary
  ON sale_holder_assignments (sale_id) WHERE is_primary AND deleted_at IS NULL;
CREATE UNIQUE INDEX sale_holder_assignments_contact
  ON sale_holder_assignments (sale_id,contact_id,segment,COALESCE(zone,''))
  WHERE deleted_at IS NULL;
CREATE INDEX sale_holder_assignments_contact_lookup
  ON sale_holder_assignments (contact_id,sale_id) WHERE deleted_at IS NULL;

CREATE TRIGGER sale_holder_assignments_set_updated_at
  BEFORE UPDATE ON sale_holder_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Backfill every historical order with its current effective contact. Later
-- reconciliation migrations may split a row when BM identifies multiple people.
INSERT INTO sale_holder_assignments
  (sale_id,contact_id,quantity,segment,zone,source,source_holder_name,is_primary,created_by,updated_by)
SELECT es.id,es.effective_contact_id,
       totals.quantity,
       CASE
         WHEN totals.is_commitment THEN 'Compromisos'
         WHEN lower(COALESCE(totals.zone,'')) LIKE '%vip%' OR lower(COALESCE(totals.zone,''))='suites' THEN 'VIP'
         WHEN lower(COALESCE(totals.zone,'')) LIKE '%preferente%'
           OR lower(COALESCE(totals.zone,'')) LIKE '%premier%'
           OR lower(COALESCE(totals.zone,'')) LIKE '%planta baja%' THEN 'Preferente'
         ELSE 'General'
       END,
       totals.zone,'migration',concat(c.first_name,' ',c.last_name),true,
       es.created_by,es.updated_by
FROM effective_sales es
JOIN contacts c ON c.id=es.effective_contact_id
JOIN LATERAL (
  SELECT sum((item->>'quantity')::integer)::integer AS quantity,
         (array_agg(NULLIF(item->>'zone','') ORDER BY item->>'zone'))[1] AS zone,
         bool_or(lower(COALESCE(item->>'product','')) LIKE '%compromiso%'
           OR lower(COALESCE(item->>'zone',''))='zona suites') AS is_commitment
  FROM jsonb_array_elements(es.effective_items) item
) totals ON totals.quantity > 0
WHERE es.deleted_at IS NULL;

COMMENT ON TABLE sale_holder_assignments IS
  'Auditable allocation of subscription units from one commercial order to one or more CRM contacts.';
