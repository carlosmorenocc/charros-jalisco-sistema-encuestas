CREATE TABLE rewards_program_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES rewards_programs(id) ON DELETE CASCADE,
  season_code text NOT NULL REFERENCES rewards_seasons(code) ON DELETE RESTRICT,
  historical_order_number text NOT NULL,
  historical_zone text NOT NULL,
  historical_section text NOT NULL,
  historical_seat text NOT NULL,
  reason text NOT NULL,
  source_reference text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rewards_program_aliases_historical_key_unique
    UNIQUE (
      season_code,
      historical_order_number,
      historical_zone,
      historical_section,
      historical_seat
    )
);

CREATE INDEX rewards_program_aliases_program_idx
  ON rewards_program_aliases(program_id)
  WHERE active;

CREATE UNIQUE INDEX rewards_program_aliases_normalized_key_unique
  ON rewards_program_aliases (
    season_code,
    regexp_replace(upper(historical_order_number), '[^A-Z0-9]', '', 'g'),
    regexp_replace(upper(historical_zone), '[^A-Z0-9]', '', 'g'),
    regexp_replace(upper(historical_section), '[^A-Z0-9]', '', 'g'),
    regexp_replace(upper(historical_seat), '[^A-Z0-9]', '', 'g')
  );

-- Las migraciones se ejecutan antes del bootstrap en un entorno nuevo. Este
-- trigger provisiona los dos aliases conocidos cuando aparecen los programas
-- vigentes, sin depender de que el padrón ya exista al aplicar esta migración.
CREATE FUNCTION rewards_sync_manuel_historical_aliases()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_seat text;
  historical_seat text;
BEGIN
  normalized_seat := regexp_replace(upper(NEW.seat), '[^A-Z0-9]', '', 'g');
  IF NEW.season_code <> 'LMP-2026-27'
    OR NEW.order_number <> '15772800'
    OR regexp_replace(upper(NEW.section), '[^A-Z0-9]', '', 'g') <> '103'
    OR normalized_seat NOT IN ('B1','B2')
    OR NOT NEW.active
    OR NEW.eligibility_status <> 'eligible'
  THEN
    RETURN NEW;
  END IF;

  historical_seat := CASE normalized_seat WHEN 'B1' THEN 'G1' ELSE 'G2' END;
  INSERT INTO rewards_program_aliases(
    program_id,season_code,historical_order_number,historical_zone,
    historical_section,historical_seat,reason,source_reference
  )
  VALUES(
    NEW.id,NEW.season_code,'15551242','Butaca Preferente Tercera Base',
    '219',historical_seat,
    'Cambio de butacas confirmado con Boleto Móvil; conservar continuidad histórica',
    'boleto-movil:inauguracion-2026-10-13'
  )
  ON CONFLICT (
    season_code,historical_order_number,historical_zone,historical_section,historical_seat
  ) DO UPDATE SET
    program_id=EXCLUDED.program_id,
    reason=EXCLUDED.reason,
    source_reference=EXCLUDED.source_reference,
    active=true,
    updated_at=now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER rewards_programs_sync_manuel_historical_aliases
AFTER INSERT OR UPDATE OF season_code,order_number,section,seat,active,eligibility_status
ON rewards_programs
FOR EACH ROW
EXECUTE FUNCTION rewards_sync_manuel_historical_aliases();

DO $$
DECLARE
  source_count integer;
  target_count integer;
  physical_conflict_count integer;
  target_order_id uuid;
  changed_ids text[];
BEGIN
  -- Boleto Móvil es la fuente autoritativa: la orden 15529289 tiene F1-F4 y G1-G4.
  SELECT count(*)::integer
  INTO source_count
  FROM rewards_programs
  WHERE season_code='LMP-2026-27'
    AND order_number='15529289'
    AND regexp_replace(upper(zone), '[^A-Z0-9]', '', 'g')='VIP'
    AND regexp_replace(upper(section), '[^A-Z0-9]', '', 'g')='215'
    AND regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g') IN ('D1','D2','D3','D4');

  IF source_count > 0 THEN
    IF source_count <> 4 THEN
      RAISE EXCEPTION 'Expected four D seats for order 15529289; found %', source_count;
    END IF;

    SELECT count(*)::integer
    INTO target_count
    FROM rewards_programs
    WHERE season_code='LMP-2026-27'
      AND order_number='15529289'
      AND regexp_replace(upper(zone), '[^A-Z0-9]', '', 'g')='VIP'
      AND regexp_replace(upper(section), '[^A-Z0-9]', '', 'g')='215'
      AND regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g') IN ('F1','F2','F3','F4');

    IF target_count <> 0 THEN
      RAISE EXCEPTION 'Cannot correct order 15529289 because F seats already conflict';
    END IF;

    SELECT count(*)::integer
    INTO physical_conflict_count
    FROM rewards_programs
    WHERE season_code='LMP-2026-27'
      AND order_number<>'15529289'
      AND active
      AND eligibility_status='eligible'
      AND regexp_replace(upper(zone), '[^A-Z0-9]', '', 'g')='VIP'
      AND regexp_replace(upper(section), '[^A-Z0-9]', '', 'g')='215'
      AND regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g') IN ('F1','F2','F3','F4');
    IF physical_conflict_count <> 0 THEN
      RAISE EXCEPTION 'Cannot correct order 15529289: F seats are assigned to another order';
    END IF;

    WITH corrected AS (
      UPDATE rewards_programs
      SET seat=CASE regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g')
            WHEN 'D1' THEN 'F1'
            WHEN 'D2' THEN 'F2'
            WHEN 'D3' THEN 'F3'
            WHEN 'D4' THEN 'F4'
          END,
          manual_lock=true,
          updated_at=now()
      WHERE season_code='LMP-2026-27'
        AND order_number='15529289'
        AND regexp_replace(upper(zone), '[^A-Z0-9]', '', 'g')='VIP'
        AND regexp_replace(upper(section), '[^A-Z0-9]', '', 'g')='215'
        AND regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g') IN ('D1','D2','D3','D4')
      RETURNING id::text
    )
    SELECT array_agg(id ORDER BY id) INTO changed_ids FROM corrected;

    INSERT INTO rewards_audit(action,entity_type,entity_id,reason,metadata)
    VALUES(
      'roster.authoritative_correction',
      'order',
      '15529289',
      'Corrección confirmada con Boleto Móvil',
      jsonb_build_object('programIds',changed_ids,'fromSeats',ARRAY['D1','D2','D3','D4'],'toSeats',ARRAY['F1','F2','F3','F4'])
    );
  END IF;

  -- A17 pertenece a la orden 15243415; A16 permanece en 15421233.
  SELECT count(*)::integer
  INTO source_count
  FROM rewards_programs
  WHERE season_code='LMP-2026-27'
    AND order_number='15421233'
    AND regexp_replace(upper(section), '[^A-Z0-9]', '', 'g')='120'
    AND regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g')='A17';

  SELECT count(*)::integer
  INTO target_count
  FROM rewards_programs
  WHERE season_code='LMP-2026-27'
    AND order_number='15243415'
    AND regexp_replace(upper(section), '[^A-Z0-9]', '', 'g')='120'
    AND regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g')='A17';

  IF source_count = 1 AND target_count = 0 THEN
    INSERT INTO rewards_orders(
      season_code,order_number,purchase_code,buyer_holder_id,seller,discount_label,
      purchased_at,payment_type,source_event,active
    )
    SELECT
      season_code,'15243415',NULL,buyer_holder_id,seller,discount_label,
      purchased_at,payment_type,source_event,true
    FROM rewards_orders
    WHERE season_code='LMP-2026-27' AND order_number='15421233'
    ON CONFLICT(season_code,order_number) DO UPDATE SET
      active=true,
      updated_at=now();

    SELECT id INTO target_order_id
    FROM rewards_orders
    WHERE season_code='LMP-2026-27' AND order_number='15243415';
    IF target_order_id IS NULL THEN
      RAISE EXCEPTION 'Could not create rewards order 15243415';
    END IF;

    UPDATE rewards_programs
    SET order_number='15243415',order_id=target_order_id,purchase_code=NULL,
        manual_lock=true,updated_at=now()
    WHERE season_code='LMP-2026-27'
      AND order_number='15421233'
      AND regexp_replace(upper(section), '[^A-Z0-9]', '', 'g')='120'
      AND regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g')='A17';

    INSERT INTO rewards_audit(action,entity_type,entity_id,reason,metadata)
    VALUES(
      'roster.authoritative_correction','program','15243415/120/A17',
      'Corrección confirmada con Boleto Móvil',
      jsonb_build_object('fromOrder','15421233','toOrder','15243415','seat','A17')
    );
  ELSIF NOT (source_count = 0 AND target_count = 1) AND (source_count + target_count) > 0 THEN
    RAISE EXCEPTION 'Unexpected A17 roster state: source %, target %', source_count, target_count;
  END IF;

  -- C1 y C2 pertenecen a 14957727; C3 permanece en 15157532.
  SELECT count(*)::integer
  INTO source_count
  FROM rewards_programs
  WHERE season_code='LMP-2026-27'
    AND order_number='15157532'
    AND regexp_replace(upper(section), '[^A-Z0-9]', '', 'g')='411S1'
    AND regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g') IN ('C1','C2');

  SELECT count(*)::integer
  INTO target_count
  FROM rewards_programs
  WHERE season_code='LMP-2026-27'
    AND order_number='14957727'
    AND regexp_replace(upper(section), '[^A-Z0-9]', '', 'g')='411S1'
    AND regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g') IN ('C1','C2');

  IF source_count = 2 AND target_count = 0 THEN
    INSERT INTO rewards_orders(
      season_code,order_number,purchase_code,buyer_holder_id,seller,discount_label,
      purchased_at,payment_type,source_event,active
    )
    SELECT
      season_code,'14957727',NULL,buyer_holder_id,seller,discount_label,
      purchased_at,payment_type,source_event,true
    FROM rewards_orders
    WHERE season_code='LMP-2026-27' AND order_number='15157532'
    ON CONFLICT(season_code,order_number) DO UPDATE SET
      active=true,
      updated_at=now();

    SELECT id INTO target_order_id
    FROM rewards_orders
    WHERE season_code='LMP-2026-27' AND order_number='14957727';
    IF target_order_id IS NULL THEN
      RAISE EXCEPTION 'Could not create rewards order 14957727';
    END IF;

    UPDATE rewards_programs
    SET order_number='14957727',order_id=target_order_id,purchase_code=NULL,
        manual_lock=true,updated_at=now()
    WHERE season_code='LMP-2026-27'
      AND order_number='15157532'
      AND regexp_replace(upper(section), '[^A-Z0-9]', '', 'g')='411S1'
      AND regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g') IN ('C1','C2');

    INSERT INTO rewards_audit(action,entity_type,entity_id,reason,metadata)
    VALUES(
      'roster.authoritative_correction','order','14957727',
      'Corrección confirmada con Boleto Móvil',
      jsonb_build_object('fromOrder','15157532','toOrder','14957727','seats',ARRAY['C1','C2'])
    );
  ELSIF NOT (source_count = 0 AND target_count = 2) AND (source_count + target_count) > 0 THEN
    RAISE EXCEPTION 'Unexpected C1-C2 roster state: source %, target %', source_count, target_count;
  END IF;
END;
$$;

-- Manuel usó G1-G2 de la orden anterior en la inauguración. Ambos aliases
-- apuntan a sus programas vigentes B1-B2 para mantener un solo contador.
INSERT INTO rewards_program_aliases(
  program_id,season_code,historical_order_number,historical_zone,
  historical_section,historical_seat,reason,source_reference
)
SELECT
  p.id,p.season_code,'15551242','Butaca Preferente Tercera Base','219',
  CASE regexp_replace(upper(p.seat), '[^A-Z0-9]', '', 'g')
    WHEN 'B1' THEN 'G1'
    WHEN 'B2' THEN 'G2'
  END,
  'Cambio de butacas confirmado con Boleto Móvil; conservar continuidad histórica',
  'boleto-movil:inauguracion-2026-10-13'
FROM rewards_programs p
WHERE p.season_code='LMP-2026-27'
  AND p.order_number='15772800'
  AND regexp_replace(upper(p.section), '[^A-Z0-9]', '', 'g')='103'
  AND regexp_replace(upper(p.seat), '[^A-Z0-9]', '', 'g') IN ('B1','B2')
  AND p.active
  AND p.eligibility_status='eligible'
ON CONFLICT (
  season_code,historical_order_number,historical_zone,historical_section,historical_seat
) DO UPDATE SET
  program_id=EXCLUDED.program_id,
  reason=EXCLUDED.reason,
  source_reference=EXCLUDED.source_reference,
  active=true,
  updated_at=now();

DO $$
DECLARE
  roster_count integer;
  alias_target_count integer;
  alias_count integer;
  correction_count integer;
  order_program_count integer;
  physical_duplicate_count integer;
BEGIN
  SELECT count(*)::integer
  INTO roster_count
  FROM rewards_programs
  WHERE season_code='LMP-2026-27'
    AND active
    AND eligibility_status='eligible';

  SELECT count(*)::integer
  INTO alias_target_count
  FROM rewards_programs
  WHERE season_code='LMP-2026-27'
    AND order_number='15772800'
    AND regexp_replace(upper(section), '[^A-Z0-9]', '', 'g')='103'
    AND regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g') IN ('B1','B2')
    AND active
    AND eligibility_status='eligible';

  SELECT count(*)::integer
  INTO alias_count
  FROM rewards_program_aliases a
  JOIN rewards_programs p ON p.id=a.program_id
  WHERE a.season_code='LMP-2026-27'
    AND a.historical_order_number='15551242'
    AND a.historical_zone='Butaca Preferente Tercera Base'
    AND a.historical_section='219'
    AND a.active
    AND p.order_number='15772800'
    AND regexp_replace(upper(p.section), '[^A-Z0-9]', '', 'g')='103'
    AND (
      (a.historical_seat='G1' AND regexp_replace(upper(p.seat), '[^A-Z0-9]', '', 'g')='B1')
      OR
      (a.historical_seat='G2' AND regexp_replace(upper(p.seat), '[^A-Z0-9]', '', 'g')='B2')
    );

  IF roster_count > 0 AND (alias_target_count <> 2 OR alias_count <> 2) THEN
    RAISE EXCEPTION 'Historical continuity is incomplete: targets %, aliases %', alias_target_count, alias_count;
  END IF;

  IF roster_count > 0 THEN
    SELECT count(*)::integer
    INTO correction_count
    FROM rewards_programs
    WHERE season_code='LMP-2026-27'
      AND order_number='15529289'
      AND regexp_replace(upper(zone), '[^A-Z0-9]', '', 'g')='VIP'
      AND regexp_replace(upper(section), '[^A-Z0-9]', '', 'g')='215'
      AND regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g') IN ('F1','F2','F3','F4','G1','G2','G3','G4')
      AND active
      AND eligibility_status='eligible';

    SELECT count(*)::integer
    INTO order_program_count
    FROM rewards_programs
    WHERE season_code='LMP-2026-27'
      AND order_number='15529289'
      AND regexp_replace(upper(zone), '[^A-Z0-9]', '', 'g')='VIP'
      AND regexp_replace(upper(section), '[^A-Z0-9]', '', 'g')='215'
      AND active
      AND eligibility_status='eligible';
    IF correction_count <> 8 OR order_program_count <> 8 THEN
      RAISE EXCEPTION 'Order 15529289 does not contain exactly F1-F4 and G1-G4';
    END IF;

    SELECT count(*)::integer
    INTO correction_count
    FROM rewards_programs
    WHERE season_code='LMP-2026-27'
      AND (
        (order_number='15243415' AND regexp_replace(upper(section), '[^A-Z0-9]', '', 'g')='120' AND regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g')='A17')
        OR
        (order_number='15421233' AND regexp_replace(upper(section), '[^A-Z0-9]', '', 'g')='120' AND regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g')='A16')
      )
      AND active
      AND eligibility_status='eligible';
    IF correction_count <> 2 THEN
      RAISE EXCEPTION 'Premier 120 A16-A17 authoritative orders are incomplete';
    END IF;

    SELECT count(*)::integer
    INTO correction_count
    FROM rewards_programs
    WHERE season_code='LMP-2026-27'
      AND regexp_replace(upper(section), '[^A-Z0-9]', '', 'g')='411S1'
      AND (
        (order_number='14957727' AND regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g') IN ('C1','C2'))
        OR
        (order_number='15157532' AND regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g')='C3')
      )
      AND active
      AND eligibility_status='eligible';
    IF correction_count <> 3 THEN
      RAISE EXCEPTION 'Planta Alta 411-S1 C1-C3 authoritative orders are incomplete';
    END IF;
  END IF;

  SELECT count(*)::integer
  INTO physical_duplicate_count
  FROM (
    SELECT
      regexp_replace(upper(zone), '[^A-Z0-9]', '', 'g'),
      regexp_replace(upper(section), '[^A-Z0-9]', '', 'g'),
      regexp_replace(upper(seat), '[^A-Z0-9]', '', 'g')
    FROM rewards_programs
    WHERE season_code='LMP-2026-27'
      AND active
      AND eligibility_status='eligible'
    GROUP BY 1,2,3
    HAVING count(*) > 1
  ) duplicated;

  IF physical_duplicate_count <> 0 THEN
    RAISE EXCEPTION 'The active roster contains % duplicated physical seat(s)', physical_duplicate_count;
  END IF;
END;
$$;

INSERT INTO rewards_audit(action,entity_type,entity_id,reason,metadata)
SELECT
  'program.aliases.reconciled','order','15551242',
  'Continuidad histórica confirmada con Boleto Móvil',
  jsonb_build_object(
    'currentOrder','15772800',
    'historicalSeats',ARRAY['G1','G2'],
    'currentSeats',ARRAY['B1','B2'],
    'aliases',count(*)
  )
FROM rewards_program_aliases
WHERE season_code='LMP-2026-27'
  AND historical_order_number='15551242'
  AND active
HAVING count(*) > 0;
