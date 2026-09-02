-- One operational row per sold seat. Financial totals continue to live on the
-- sale; this table only stores optional fulfillment metadata.
CREATE TABLE sale_seat_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_assignment_id uuid NOT NULL REFERENCES sale_holder_assignments(id),
  unit_number integer NOT NULL CHECK (unit_number BETWEEN 1 AND 100),
  seat_identifier text,
  jersey_size text CHECK (jersey_size IN ('S','M','L','XL','2XL')),
  seat_personalization text CHECK (char_length(seat_personalization) <= 120),
  source text NOT NULL DEFAULT 'crm' CHECK (source IN ('crm','boletomovil','migration')),
  created_by uuid NOT NULL REFERENCES app_users(id),
  updated_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES app_users(id),
  row_version integer NOT NULL DEFAULT 1,
  UNIQUE (holder_assignment_id,unit_number)
);

CREATE TRIGGER sale_seat_units_set_updated_at
  BEFORE UPDATE ON sale_seat_units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO sale_seat_units
  (holder_assignment_id,unit_number,seat_identifier,source,created_by,updated_by)
SELECT ha.id,slot,
       CASE WHEN cardinality(ha.seat_identifiers)=ha.quantity THEN ha.seat_identifiers[slot] END,
       ha.source,ha.created_by,ha.updated_by
FROM sale_holder_assignments ha
CROSS JOIN LATERAL generate_series(1,ha.quantity) slot
WHERE ha.deleted_at IS NULL;

-- Historical memberships and sales did not have a direct foreign key. Allocate
-- their units deterministically within each contact and season; explicit holder
-- seat arrays always win. Unmatched seats remain visible with a blank identifier.
WITH holder_slots AS (
  SELECT su.id,
    row_number() OVER (
      PARTITION BY ha.contact_id,es.season_code
      ORDER BY es.effective_sold_at NULLS LAST,es.id,ha.is_primary DESC,su.unit_number
    ) AS contact_unit_number
  FROM sale_seat_units su
  JOIN sale_holder_assignments ha ON ha.id=su.holder_assignment_id
  JOIN effective_sales es ON es.id=ha.sale_id
  WHERE su.deleted_at IS NULL AND ha.deleted_at IS NULL AND es.deleted_at IS NULL
), membership_slots AS (
  SELECT mu.seat_identifier,mu.jersey_size,
    row_number() OVER (
      PARTITION BY m.contact_id,m.season_code
      ORDER BY m.start_date NULLS LAST,m.created_at,m.id,mu.unit_number
    ) AS contact_unit_number,
    m.contact_id,m.season_code
  FROM membership_units mu
  JOIN memberships m ON m.id=mu.membership_id
  WHERE mu.deleted_at IS NULL AND m.deleted_at IS NULL
), holder_identity AS (
  SELECT hs.id,ha.contact_id,es.season_code,hs.contact_unit_number
  FROM holder_slots hs
  JOIN sale_seat_units su ON su.id=hs.id
  JOIN sale_holder_assignments ha ON ha.id=su.holder_assignment_id
  JOIN effective_sales es ON es.id=ha.sale_id
)
UPDATE sale_seat_units su
SET seat_identifier=ms.seat_identifier,jersey_size=ms.jersey_size,source='migration'
FROM holder_identity hi
JOIN membership_slots ms ON ms.contact_id=hi.contact_id
  AND ms.season_code=hi.season_code AND ms.contact_unit_number=hi.contact_unit_number
WHERE su.id=hi.id AND su.seat_identifier IS NULL;

COMMENT ON TABLE sale_seat_units IS
  'One row per order seat, including optional jersey size and seat personalization.';
