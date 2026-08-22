-- Technical ledger for the controlled, historical staging-to-canonical promotion.
-- Canonical operational timestamps stay before cutover; promoted_at is the only
-- timestamp that intentionally records when the technical load occurred.
ALTER TABLE import_batches
  ADD COLUMN config_version text,
  ADD COLUMN config_sha256 char(64)
    CHECK (config_sha256 IS NULL OR config_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN importer_release text;

CREATE TABLE import_promotion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES import_batches(id),
  promotion_version text NOT NULL,
  pipeline_release text NOT NULL,
  config_version text NOT NULL,
  config_sha256 char(64) NOT NULL CHECK (config_sha256 ~ '^[0-9a-f]{64}$'),
  plan_sha256 char(64) NOT NULL CHECK (plan_sha256 ~ '^[0-9a-f]{64}$'),
  historical_cutoff_at timestamptz NOT NULL,
  operational_cutover_at timestamptz NOT NULL,
  promoted_by uuid NOT NULL REFERENCES app_users(id),
  promoted_at timestamptz NOT NULL DEFAULT now(),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (historical_cutoff_at < operational_cutover_at),
  CHECK (operational_cutover_at <= promoted_at),
  UNIQUE (import_batch_id, promotion_version)
);

CREATE TABLE import_promotion_entities (
  promotion_run_id uuid NOT NULL REFERENCES import_promotion_runs(id),
  source_record_id uuid NOT NULL REFERENCES source_records(id),
  entity_type text NOT NULL CHECK (entity_type IN (
    'contact', 'contact_alias', 'contact_consent', 'membership',
    'membership_unit', 'task', 'campaign', 'campaign_message', 'source_resolution'
  )),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN (
    'created', 'matched', 'linked', 'enriched', 'resolved', 'ignored',
    'blocked', 'deferred', 'quarantined'
  )),
  decision_reason text,
  historical_occurred_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (promotion_run_id, source_record_id, entity_type, entity_id, action)
);

CREATE INDEX import_promotion_entities_entity_idx
  ON import_promotion_entities (entity_type, entity_id);
CREATE INDEX import_promotion_entities_source_idx
  ON import_promotion_entities (source_record_id);

CREATE TRIGGER import_promotion_runs_immutable
  BEFORE UPDATE OR DELETE ON import_promotion_runs
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER import_promotion_entities_immutable
  BEFORE UPDATE OR DELETE ON import_promotion_entities
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

-- Serialize every canonical identity mutation with the exact lock namespace
-- already used by createManualRegistration. Keeping this at the database layer
-- also covers POST /contacts, imports and future writers that use these tables.
CREATE FUNCTION lock_crm_contact_identity(email_value text, phone_value text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  identity_key text;
  phone_digits text;
  identity_keys text[] := ARRAY[]::text[];
BEGIN
  IF NULLIF(lower(btrim(email_value)), '') IS NOT NULL THEN
    identity_keys := array_append(identity_keys, 'email:' || lower(btrim(email_value)));
  END IF;
  phone_digits := regexp_replace(COALESCE(phone_value, ''), '[^0-9]', '', 'g');
  IF length(phone_digits) = 12 AND left(phone_digits, 2) = '52' THEN
    phone_digits := right(phone_digits, 10);
  ELSIF length(phone_digits) = 13 AND left(phone_digits, 3) = '521' THEN
    phone_digits := right(phone_digits, 10);
  END IF;
  IF length(phone_digits) = 10 THEN
    identity_keys := array_append(identity_keys, 'phone:' || phone_digits);
  END IF;
  FOR identity_key IN
    SELECT DISTINCT keys.value
      FROM unnest(identity_keys) AS keys(value)
     ORDER BY keys.value
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('manual-registration-identity:' || identity_key, 0)
    );
  END LOOP;
END;
$$;

CREATE FUNCTION lock_crm_contact_identity_row()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM lock_crm_contact_identity(NEW.email, NEW.phone);
  RETURN NEW;
END;
$$;

CREATE FUNCTION lock_crm_contact_alias_identity_row()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.alias_type = 'email' THEN
    PERFORM lock_crm_contact_identity(NEW.alias_value, NULL);
  ELSIF NEW.alias_type = 'phone' THEN
    PERFORM lock_crm_contact_identity(NULL, NEW.alias_value);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER contacts_identity_lock
  BEFORE INSERT OR UPDATE OF email, phone ON contacts
  FOR EACH ROW EXECUTE FUNCTION lock_crm_contact_identity_row();
CREATE TRIGGER contact_aliases_identity_lock
  BEFORE INSERT OR UPDATE OF alias_type, alias_value ON contact_aliases
  FOR EACH ROW EXECUTE FUNCTION lock_crm_contact_alias_identity_row();
