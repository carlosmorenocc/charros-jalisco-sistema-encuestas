-- Structured commercial scope for subscriptions and annual suite commitments.
-- Financial amounts remain in sales/payments; these terms explain what the
-- order covers without duplicating accounting data.
CREATE TABLE sale_commercial_terms (
  sale_id uuid PRIMARY KEY REFERENCES sales(id),
  commercial_category text NOT NULL DEFAULT 'subscription'
    CHECK (commercial_category IN ('subscription','commitment')),
  coverage_seasons integer NOT NULL DEFAULT 1 CHECK (coverage_seasons BETWEEN 1 AND 10),
  suite_number text CHECK (suite_number IS NULL OR char_length(trim(suite_number)) BETWEEN 1 AND 40),
  created_by uuid NOT NULL REFERENCES app_users(id),
  updated_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version integer NOT NULL DEFAULT 1,
  CHECK (
    commercial_category='commitment'
    OR (coverage_seasons=1 AND suite_number IS NULL)
  )
);

CREATE TRIGGER sale_commercial_terms_set_updated_at
  BEFORE UPDATE ON sale_commercial_terms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO sale_commercial_terms
  (sale_id,commercial_category,coverage_seasons,suite_number,created_by,updated_by)
SELECT es.id,
  CASE WHEN inferred.is_commitment THEN 'commitment' ELSE 'subscription' END,
  CASE WHEN inferred.is_commitment THEN 2 ELSE 1 END,
  inferred.suite_number,
  es.created_by,es.updated_by
FROM effective_sales es
CROSS JOIN LATERAL (
  SELECT
    bool_or(
      lower(COALESCE(item->>'product','')) LIKE '%compromiso%'
      OR lower(COALESCE(item->>'zone',''))='zona suites'
    ) AS is_commitment,
    (array_agg(
      CASE WHEN COALESCE(item->>'zone','') ~* '^suite[[:space:]]+[^[:space:]]'
        THEN trim(regexp_replace(item->>'zone','^suite[[:space:]]+','','i')) END
      ORDER BY item->>'zone'
    ) FILTER (WHERE COALESCE(item->>'zone','') ~* '^suite[[:space:]]+[^[:space:]]'))[1] AS suite_number
  FROM jsonb_array_elements(es.effective_items) item
) inferred
WHERE es.deleted_at IS NULL
ON CONFLICT (sale_id) DO NOTHING;

COMMENT ON TABLE sale_commercial_terms IS
  'Structured scope and suite identity for each commercial order; legacy suite numbers may remain null until audited.';
