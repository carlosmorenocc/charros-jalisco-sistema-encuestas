-- Reconcile the two approved contacts whose additional confirmed orders were
-- recorded as sales but did not increase their active membership seat count.
WITH target_contacts AS (
  SELECT c.id
  FROM contacts c
  WHERE c.deleted_at IS NULL
    AND upper(trim(concat_ws(' ', c.first_name, c.last_name))) IN (
      'FERNANDO BARAJAS RAMIREZ',
      'FABBY LEAÑO',
      'FABBY LEANO'
    )
), target_sales AS (
  SELECT
    s.effective_contact_id AS contact_id,
    s.season_code,
    sum(items.seat_count)::integer AS sold_seats,
    (array_agg(s.created_by ORDER BY s.effective_sold_at DESC NULLS LAST, s.created_at DESC))[1] AS actor_id,
    left('ÓRDENES ' || string_agg(s.effective_external_order_number, ', ' ORDER BY s.effective_sold_at, s.created_at), 160) AS product,
    (array_agg(items.primary_zone ORDER BY s.effective_sold_at DESC NULLS LAST, s.created_at DESC))[1] AS zone
  FROM effective_sales s
  JOIN target_contacts target ON target.id = s.effective_contact_id
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(sum((item->>'quantity')::integer), 0)::integer AS seat_count,
      (array_agg(NULLIF(item->>'zone', '') ORDER BY item_index))[1] AS primary_zone
    FROM jsonb_array_elements(s.effective_items) WITH ORDINALITY AS source(item, item_index)
  ) items
  WHERE s.deleted_at IS NULL
    AND s.effective_status IN ('confirmed', 'reserved')
  GROUP BY s.effective_contact_id, s.season_code
), active_memberships AS (
  SELECT m.contact_id, m.season_code, sum(m.seat_count)::integer AS active_seats
  FROM memberships m
  JOIN target_contacts target ON target.id = m.contact_id
  WHERE m.deleted_at IS NULL AND m.membership_status = 'active'
  GROUP BY m.contact_id, m.season_code
), deficits AS (
  SELECT
    sales.contact_id,
    sales.season_code,
    sales.sold_seats - COALESCE(memberships.active_seats, 0) AS missing_seats,
    sales.actor_id,
    sales.product,
    sales.zone,
    CASE
      WHEN lower(COALESCE(sales.zone, '')) LIKE '%vip%' THEN 'VIP'
      WHEN lower(COALESCE(sales.zone, '')) LIKE '%preferente%'
        OR lower(COALESCE(sales.zone, '')) LIKE '%premier%'
        OR lower(COALESCE(sales.zone, '')) LIKE '%planta baja%' THEN 'Preferente'
      ELSE 'General'
    END AS section
  FROM target_sales sales
  LEFT JOIN active_memberships memberships
    ON memberships.contact_id = sales.contact_id
   AND memberships.season_code = sales.season_code
  WHERE sales.sold_seats > COALESCE(memberships.active_seats, 0)
), inserted_memberships AS (
  INSERT INTO memberships (
    contact_id, season_code, membership_status, seat_count, zone, section,
    product, start_date, created_by, updated_by
  )
  SELECT
    contact_id, season_code, 'active', missing_seats, zone, section,
    product, current_date, actor_id, actor_id
  FROM deficits
  RETURNING id, seat_count, zone, product, created_by
)
INSERT INTO membership_units (
  membership_id, unit_number, zone, product, created_by, updated_by
)
SELECT
  membership.id, unit_number, membership.zone, membership.product,
  membership.created_by, membership.created_by
FROM inserted_memberships membership
CROSS JOIN LATERAL generate_series(1, membership.seat_count) AS unit_number;
