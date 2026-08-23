ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_identity_present;
ALTER TABLE contacts ADD CONSTRAINT contacts_identity_present CHECK (
  email IS NOT NULL OR phone IS NOT NULL OR external_ref IS NOT NULL
);

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS is_commitment_only boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS operational_dataset_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_sha256 text NOT NULL UNIQUE,
  source_label text NOT NULL,
  metrics jsonb NOT NULL,
  imported_by uuid NOT NULL REFERENCES app_users(id),
  imported_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE operational_dataset_runs IS
  'Ledger de sincronizaciones auditadas LMP; no almacena PII ni el payload fuente.';
