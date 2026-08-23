CREATE INDEX contacts_active_dashboard_idx
  ON contacts (subscriber_status, commercial_stage, executive_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX contacts_last_contact_idx
  ON contacts (last_human_contact_at) WHERE deleted_at IS NULL;
CREATE INDEX contacts_follow_up_idx
  ON contacts (next_follow_up_at) WHERE deleted_at IS NULL AND next_follow_up_at IS NOT NULL;
CREATE INDEX memberships_contact_idx
  ON memberships (contact_id, season_code) WHERE deleted_at IS NULL;
CREATE INDEX membership_units_membership_idx
  ON membership_units (membership_id, unit_number) WHERE deleted_at IS NULL;
CREATE INDEX contact_assignments_history_idx
  ON contact_assignments (contact_id, assigned_at DESC);
CREATE INDEX contact_consents_history_idx
  ON contact_consents (contact_id, captured_at DESC);
CREATE UNIQUE INDEX import_match_candidates_unordered_pair_unique
  ON import_match_candidates (
    import_batch_id,
    LEAST(left_source_record_id, right_source_record_id),
    GREATEST(left_source_record_id, right_source_record_id)
  );
CREATE INDEX interactions_contact_timeline_idx
  ON interactions (contact_id, occurred_at DESC) WHERE voided_at IS NULL;
CREATE INDEX tasks_assignee_due_idx
  ON tasks (assigned_to, status, due_at) WHERE deleted_at IS NULL;
CREATE INDEX tasks_contact_idx
  ON tasks (contact_id, due_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX sales_contact_idx
  ON sales (contact_id, sold_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX sales_executive_idx
  ON sales (executive_id, sold_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX campaign_messages_contact_idx ON campaign_messages (contact_id, sent_at DESC);
CREATE INDEX campaign_message_events_timeline_idx
  ON campaign_message_events (campaign_message_id, occurred_at DESC);
CREATE INDEX audit_events_actor_time_idx ON audit_events (actor_id, occurred_at DESC);
CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id, occurred_at DESC);

CREATE VIEW contact_operational_summary AS
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
  t.overdue_tasks
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
