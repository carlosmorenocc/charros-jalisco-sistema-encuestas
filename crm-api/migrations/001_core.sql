CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entra_object_id uuid UNIQUE,
  tenant_id uuid,
  email text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('direction', 'executive', 'supervisor', 'admin')),
  active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  CONSTRAINT app_users_identity_pair CHECK (
    (entra_object_id IS NULL AND tenant_id IS NULL)
    OR (entra_object_id IS NOT NULL AND tenant_id IS NOT NULL)
  ),
  CONSTRAINT app_users_email_format CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT app_users_corporate_email CHECK (lower(email) ~ '^[^@[:space:]]+@charrosjalisco\.com$')
);

CREATE UNIQUE INDEX app_users_email_unique_active
  ON app_users (lower(email)) WHERE deleted_at IS NULL;

CREATE TABLE user_permission_grants (
  user_id uuid NOT NULL REFERENCES app_users(id),
  permission text NOT NULL CHECK (permission IN ('data.export', 'contact.delete', 'contact.restore')),
  allowed boolean NOT NULL,
  granted_by uuid NOT NULL REFERENCES app_users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

CREATE TABLE seasons (
  code text PRIMARY KEY,
  display_name text NOT NULL,
  starts_on date,
  ends_on date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

INSERT INTO seasons (code, display_name, active)
VALUES ('LMP-2026-27', 'LMP 2026-2027', true);

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref text,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  municipality text,
  subscriber_status text NOT NULL CHECK (subscriber_status IN (
    'current_subscriber', 'renewing', 'new_subscriber', 'former_subscriber', 'prospect'
  )),
  commercial_stage text NOT NULL CHECK (commercial_stage IN (
    'unassigned', 'to_contact', 'contacted', 'follow_up', 'interested', 'reserved', 'won', 'lost'
  )),
  preferred_channel text CHECK (preferred_channel IN ('phone', 'whatsapp', 'email', 'in_person', 'other')),
  executive_id uuid REFERENCES app_users(id),
  source text,
  consent_status text NOT NULL DEFAULT 'unknown' CHECK (consent_status IN ('yes', 'no', 'unknown')),
  consent_at timestamptz,
  privacy_notice_version text,
  summary_notes text,
  last_human_contact_at timestamptz,
  next_follow_up_at timestamptz,
  created_by uuid NOT NULL REFERENCES app_users(id),
  updated_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES app_users(id),
  delete_reason text,
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT contacts_identity_present CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX contacts_external_ref_unique
  ON contacts (external_ref) WHERE external_ref IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX contacts_email_lookup ON contacts (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX contacts_phone_lookup ON contacts (phone) WHERE phone IS NOT NULL;

CREATE TABLE contact_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  alias_type text NOT NULL CHECK (alias_type IN ('email', 'phone', 'name', 'external_id')),
  alias_value text NOT NULL,
  source_system text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, alias_type, alias_value)
);

CREATE TABLE import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  source_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'imported', 'rejected')),
  total_rows integer NOT NULL DEFAULT 0,
  accepted_rows integer NOT NULL DEFAULT 0,
  quarantined_rows integer NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (source_sha256)
);

CREATE TABLE source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES import_batches(id),
  source_sheet text NOT NULL,
  source_row_number integer NOT NULL,
  source_record_id text,
  contact_id uuid REFERENCES contacts(id),
  resolution text NOT NULL CHECK (resolution IN ('pending_review', 'created', 'matched', 'quarantined', 'ignored')),
  resolution_reason text,
  normalized_fingerprint text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_payload jsonb,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_batch_id, source_sheet, source_row_number)
);

CREATE TABLE import_match_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES import_batches(id),
  left_source_record_id uuid NOT NULL REFERENCES source_records(id),
  right_source_record_id uuid NOT NULL REFERENCES source_records(id),
  confidence text NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  rule_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_status text NOT NULL DEFAULT 'pending_review'
    CHECK (review_status IN ('pending_review', 'accepted', 'rejected')),
  reviewed_by uuid REFERENCES app_users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (left_source_record_id <> right_source_record_id),
  CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL)),
  UNIQUE (import_batch_id, left_source_record_id, right_source_record_id)
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  season_code text NOT NULL REFERENCES seasons(code),
  membership_status text NOT NULL CHECK (membership_status IN ('active', 'renewing', 'expired', 'cancelled')),
  seat_count integer NOT NULL DEFAULT 1 CHECK (seat_count BETWEEN 1 AND 100),
  seat_identifier text,
  zone text,
  product text,
  start_date date,
  renewal_date date,
  created_by uuid NOT NULL REFERENCES app_users(id),
  updated_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES app_users(id),
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE membership_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES memberships(id),
  unit_number integer NOT NULL CHECK (unit_number BETWEEN 1 AND 100),
  seat_identifier text,
  zone text,
  product text,
  jersey_size text CHECK (jersey_size IN ('S', 'M', 'L', 'XL', '2XL')),
  created_by uuid NOT NULL REFERENCES app_users(id),
  updated_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES app_users(id),
  row_version integer NOT NULL DEFAULT 1,
  UNIQUE (membership_id, unit_number)
);

CREATE TABLE contact_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  executive_id uuid REFERENCES app_users(id),
  assigned_by uuid NOT NULL REFERENCES app_users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  reason text,
  CHECK (ended_at IS NULL OR ended_at >= assigned_at)
);

CREATE UNIQUE INDEX contact_assignments_one_current
  ON contact_assignments (contact_id) WHERE ended_at IS NULL;

CREATE TABLE contact_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  status text NOT NULL CHECK (status IN ('yes', 'no', 'unknown')),
  purpose text NOT NULL DEFAULT 'marketing',
  captured_at timestamptz NOT NULL,
  source text NOT NULL,
  privacy_notice_version text,
  evidence_ref text,
  recorded_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contact_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surviving_contact_id uuid NOT NULL REFERENCES contacts(id),
  merged_contact_id uuid NOT NULL REFERENCES contacts(id),
  merged_by uuid NOT NULL REFERENCES app_users(id),
  merged_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  field_resolution jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (surviving_contact_id <> merged_contact_id),
  UNIQUE (merged_contact_id)
);

CREATE TABLE interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  actor_id uuid NOT NULL REFERENCES app_users(id),
  occurred_at timestamptz NOT NULL,
  channel text NOT NULL CHECK (channel IN ('phone', 'whatsapp', 'email', 'in_person', 'other')),
  outcome text NOT NULL,
  notes text NOT NULL,
  is_human_contact boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES app_users(id),
  void_reason text
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  assigned_to uuid NOT NULL REFERENCES app_users(id),
  created_by uuid NOT NULL REFERENCES app_users(id),
  description text NOT NULL,
  due_at timestamptz NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES app_users(id),
  row_version integer NOT NULL DEFAULT 1
);

CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms', 'other')),
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campaign_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  contact_id uuid REFERENCES contacts(id),
  destination_hash text NOT NULL,
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campaign_message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_message_id uuid NOT NULL REFERENCES campaign_messages(id),
  event_type text NOT NULL CHECK (event_type IN (
    'sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed', 'failed'
  )),
  occurred_at timestamptz NOT NULL,
  provider_event_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_event_id)
);

CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  executive_id uuid REFERENCES app_users(id),
  season_code text NOT NULL REFERENCES seasons(code),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reserved', 'confirmed', 'cancelled', 'refunded')),
  sold_at timestamptz,
  currency char(3) NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),
  total_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  notes text,
  created_by uuid NOT NULL REFERENCES app_users(id),
  updated_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES app_users(id),
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT confirmed_sale_has_date CHECK (status <> 'confirmed' OR sold_at IS NOT NULL),
  CONSTRAINT sales_paid_not_over_total CHECK (paid_amount <= total_amount)
);

CREATE TABLE sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id),
  product text NOT NULL,
  zone text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL,
  paid_at timestamptz NOT NULL,
  reference text,
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES app_users(id),
  void_reason text
);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES app_users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  request_id uuid NOT NULL,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  user_agent text
);

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  IF to_jsonb(NEW) ? 'row_version' THEN
    NEW.row_version = OLD.row_version + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER app_users_set_updated_at BEFORE UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER contacts_set_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER memberships_set_updated_at BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER membership_units_set_updated_at BEFORE UPDATE ON membership_units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sales_set_updated_at BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER interactions_immutable
  BEFORE UPDATE OR DELETE ON interactions
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER contact_consents_immutable
  BEFORE UPDATE OR DELETE ON contact_consents
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER contact_merges_immutable
  BEFORE UPDATE OR DELETE ON contact_merges
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER sales_immutable
  BEFORE UPDATE OR DELETE ON sales
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER sale_items_immutable
  BEFORE UPDATE OR DELETE ON sale_items
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER payments_immutable
  BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER campaign_messages_immutable
  BEFORE UPDATE OR DELETE ON campaign_messages
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER campaign_message_events_immutable
  BEFORE UPDATE OR DELETE ON campaign_message_events
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
