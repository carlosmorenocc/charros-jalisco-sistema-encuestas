-- Declared tenure is not converted into fabricated historical memberships.
-- It remains distinct from the verified season count derived from memberships.
ALTER TABLE contacts
  ADD COLUMN declared_tenure_seasons smallint
    CHECK (declared_tenure_seasons BETWEEN 0 AND 100),
  ADD COLUMN acquisition_source text
    CHECK (acquisition_source IN (
      'season_ticket_database', 'referral', 'box_office', 'digital', 'event', 'outbound', 'other'
    ));

COMMENT ON COLUMN contacts.declared_tenure_seasons IS
  'Total seasons declared by the contact; not a verified membership history.';
COMMENT ON COLUMN contacts.acquisition_source IS
  'Business origin selected during CRM capture; distinct from system provenance in source.';

-- Durable idempotency for the composite manual-registration command. This
-- table stores only hashes and entity identifiers, never the submitted PII.
CREATE TABLE manual_registration_requests (
  idempotency_key uuid PRIMARY KEY,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  actor_id uuid NOT NULL REFERENCES app_users(id),
  contact_id uuid NOT NULL UNIQUE REFERENCES contacts(id),
  membership_id uuid REFERENCES memberships(id),
  interaction_id uuid NOT NULL REFERENCES interactions(id),
  task_id uuid REFERENCES tasks(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX manual_registration_requests_created_idx
  ON manual_registration_requests (created_at);

-- Keep active seats for executive KPIs while exposing active + renewing seats
-- separately for the operational contact list.
CREATE OR REPLACE VIEW contact_operational_summary AS
SELECT
  c.id,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.municipality,
  c.subscriber_status,
  c.commercial_stage,
  c.preferred_channel,
  c.executive_id,
  c.consent_status,
  c.last_human_contact_at,
  i.last_human_contact_channel,
  c.next_follow_up_at,
  c.created_at,
  c.updated_at,
  c.deleted_at,
  COALESCE(m.seat_count, 0) AS seat_count,
  COALESCE(m.seasons_count, 0) AS seasons_count,
  t.next_task_at,
  t.overdue_tasks,
  COALESCE(m.managed_seat_count, 0) AS managed_seat_count
FROM contacts c
LEFT JOIN LATERAL (
  SELECT interactions.channel AS last_human_contact_channel
  FROM interactions
  WHERE interactions.contact_id = c.id
    AND interactions.voided_at IS NULL
    AND interactions.is_human_contact = true
  ORDER BY interactions.occurred_at DESC, interactions.id DESC
  LIMIT 1
) i ON true
LEFT JOIN LATERAL (
  SELECT
    COALESCE(sum(
      CASE
        WHEN memberships.membership_status <> 'active' THEN 0
        WHEN unit_counts.unit_count > 0 THEN unit_counts.unit_count
        ELSE memberships.seat_count
      END
    ), 0)::integer AS seat_count,
    COALESCE(sum(
      CASE
        WHEN memberships.membership_status NOT IN ('active', 'renewing') THEN 0
        WHEN unit_counts.unit_count > 0 THEN unit_counts.unit_count
        ELSE memberships.seat_count
      END
    ), 0)::integer AS managed_seat_count,
    count(DISTINCT season_code)::integer AS seasons_count
  FROM memberships
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS unit_count
    FROM membership_units
    WHERE membership_id = memberships.id AND deleted_at IS NULL
  ) unit_counts ON true
  WHERE memberships.contact_id = c.id AND memberships.deleted_at IS NULL
) m ON true
LEFT JOIN LATERAL (
  SELECT
    min(due_at) FILTER (WHERE status IN ('pending', 'in_progress')) AS next_task_at,
    count(*) FILTER (WHERE status IN ('pending', 'in_progress') AND due_at < now())::integer AS overdue_tasks
  FROM tasks
  WHERE contact_id = c.id AND deleted_at IS NULL
) t ON true;
