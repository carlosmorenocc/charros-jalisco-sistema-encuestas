CREATE TABLE sale_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id),
  external_order_number text NOT NULL,
  sale_type text NOT NULL CHECK (sale_type IN ('new','renewal')),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  executive_id uuid NOT NULL REFERENCES app_users(id),
  status text NOT NULL CHECK (status IN ('draft','reserved','confirmed','cancelled','refunded')),
  sold_at timestamptz,
  total_amount numeric(14,2) NOT NULL CHECK (total_amount >= 0),
  notes text,
  items jsonb NOT NULL CHECK (jsonb_typeof(items)='array' AND jsonb_array_length(items)>0),
  reason text NOT NULL CHECK (length(trim(reason)) >= 5),
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sale_corrections_sale_latest
  ON sale_corrections (sale_id, created_at DESC, id DESC);

CREATE TRIGGER sale_corrections_immutable
BEFORE UPDATE OR DELETE ON sale_corrections
FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE VIEW effective_sales AS
SELECT s.*,
  COALESCE(c.external_order_number,s.external_order_number) AS effective_external_order_number,
  COALESCE(c.sale_type,s.sale_type) AS effective_sale_type,
  COALESCE(c.contact_id,s.contact_id) AS effective_contact_id,
  COALESCE(c.executive_id,s.executive_id) AS effective_executive_id,
  COALESCE(c.status,s.status) AS effective_status,
  COALESCE(c.sold_at,s.sold_at) AS effective_sold_at,
  COALESCE(c.total_amount,s.total_amount) AS effective_total_amount,
  COALESCE(c.notes,s.notes) AS effective_notes,
  COALESCE(c.items,(
    SELECT jsonb_agg(jsonb_build_object(
      'id',si.id,'product',si.product,'zone',si.zone,'quantity',si.quantity,
      'unitPrice',si.unit_price,'lineTotal',si.line_total
    ) ORDER BY si.id) FROM sale_items si WHERE si.sale_id=s.id
  ),'[]'::jsonb) AS effective_items,
  c.id AS correction_id,c.reason AS correction_reason,c.created_at AS corrected_at
FROM sales s
LEFT JOIN LATERAL (
  SELECT sc.* FROM sale_corrections sc
  WHERE sc.sale_id=s.id ORDER BY sc.created_at DESC,sc.id DESC LIMIT 1
) c ON true;
