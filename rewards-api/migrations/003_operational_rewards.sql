ALTER TABLE rewards_programs
  ADD COLUMN IF NOT EXISTS segment text;

UPDATE rewards_programs
SET segment = CASE
  -- En el programa oficial, Lateral Preferente pertenece a General.
  WHEN upper(zone) LIKE '%LATERAL PREFERENTE%' THEN 'GENERAL'
  WHEN upper(zone) ~ '(^|[^A-Z])VIP([^A-Z]|$)' THEN 'VIP'
  WHEN upper(zone) LIKE '%PREMIER%'
    OR upper(zone) LIKE '%PREMIERE%'
    OR upper(zone) LIKE '%PLANTA BAJA%'
    OR upper(zone) LIKE '%BUTACA PREFERENTE%'
    THEN 'PREFERENTE'
  WHEN upper(zone) LIKE '%PLANTA ALTA%'
    OR upper(zone) LIKE 'LATERAL%'
    THEN 'GENERAL'
  WHEN upper(source_event) LIKE '%ABONO VIP%' THEN 'VIP'
  WHEN upper(source_event) LIKE '%ABONO PREFERENTE%' THEN 'PREFERENTE'
  WHEN upper(source_event) LIKE '%ABONO GENERAL%' THEN 'GENERAL'
  ELSE segment
END
WHERE segment IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rewards_programs_segment_check'
  ) THEN
    ALTER TABLE rewards_programs
      ADD CONSTRAINT rewards_programs_segment_check
      CHECK (segment IN ('VIP','PREFERENTE','GENERAL'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rewards_programs_segment_active_idx
  ON rewards_programs(segment)
  WHERE active AND eligibility_status = 'eligible';

CREATE INDEX IF NOT EXISTS rewards_deliveries_active_milestone_idx
  ON rewards_deliveries(milestone,program_id)
  WHERE status <> 'reversed';

ALTER TABLE rewards_games
  DROP CONSTRAINT IF EXISTS rewards_games_report_status_check;

ALTER TABLE rewards_games
  ADD CONSTRAINT rewards_games_report_status_check
  CHECK (report_status IN ('scheduled','partial','closed'));

ALTER TABLE rewards_games
  ALTER COLUMN report_status SET DEFAULT 'scheduled';

INSERT INTO rewards_games(played_on,display_name,sequence_number,report_status) VALUES
('2026-10-13','Inauguración: Jaguares de Nayarit vs Charros',1,'scheduled'),
('2026-10-20','J1: Mayos de Navojoa vs Charros',2,'scheduled'),
('2026-10-21','J2: Mayos de Navojoa vs Charros',3,'scheduled'),
('2026-10-22','J3: Mayos de Navojoa vs Charros',4,'scheduled'),
('2026-10-27','J1: Cañeros de Los Mochis vs Charros',5,'scheduled'),
('2026-10-28','J2: Cañeros de Los Mochis vs Charros',6,'scheduled'),
('2026-10-29','J3: Cañeros de Los Mochis vs Charros',7,'scheduled'),
('2026-11-03','J1: Algodoneros de Guasave vs Charros',8,'scheduled'),
('2026-11-04','J2: Algodoneros de Guasave vs Charros',9,'scheduled'),
('2026-11-05','J3: Algodoneros de Guasave vs Charros',10,'scheduled'),
('2026-11-10','J1: Mayos de Navojoa vs Charros',11,'scheduled'),
('2026-11-11','J2: Mayos de Navojoa vs Charros',12,'scheduled'),
('2026-11-12','J3: Mayos de Navojoa vs Charros',13,'scheduled'),
('2026-11-20','J1: Jaguares de Nayarit vs Charros',14,'scheduled'),
('2026-11-21','J2: Jaguares de Nayarit vs Charros',15,'scheduled'),
('2026-11-22','J3: Jaguares de Nayarit vs Charros',16,'scheduled'),
('2026-11-27','J1: Venados de Mazatlán vs Charros',17,'scheduled'),
('2026-11-28','J2: Venados de Mazatlán vs Charros',18,'scheduled'),
('2026-11-29','J3: Venados de Mazatlán vs Charros',19,'scheduled'),
('2026-12-04','J1: Tomateros de Culiacán vs Charros',20,'scheduled'),
('2026-12-05','J2: Tomateros de Culiacán vs Charros',21,'scheduled'),
('2026-12-06','J3: Tomateros de Culiacán vs Charros',22,'scheduled'),
('2026-12-11','J1: Yaquis de Obregón vs Charros',23,'scheduled'),
('2026-12-12','J2: Yaquis de Obregón vs Charros',24,'scheduled'),
('2026-12-13','J3: Yaquis de Obregón vs Charros',25,'scheduled'),
('2026-12-18','J1: Naranjeros de Hermosillo vs Charros',26,'scheduled'),
('2026-12-19','J2: Naranjeros de Hermosillo vs Charros',27,'scheduled'),
('2026-12-20','J3: Naranjeros de Hermosillo vs Charros',28,'scheduled'),
('2026-12-21','J1: Venados de Mazatlán vs Charros',29,'scheduled'),
('2026-12-22','J2: Venados de Mazatlán vs Charros',30,'scheduled'),
('2026-12-23','J3: Venados de Mazatlán vs Charros',31,'scheduled'),
('2026-12-28','J1: Águilas de Mexicali vs Charros',32,'scheduled'),
('2026-12-29','J2: Águilas de Mexicali vs Charros',33,'scheduled'),
('2026-12-30','J3: Águilas de Mexicali vs Charros',34,'scheduled')
ON CONFLICT (played_on) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  sequence_number = EXCLUDED.sequence_number;

INSERT INTO rewards_catalog(milestone,benefit,benefit_type) VALUES
(2,'Cerveza doble de cortesía','direct'),
(4,'Dos cervezas Charros Brew en concesión','direct'),
(6,'Destilado de cortesía','direct'),
(8,'20% de descuento en Charros Team Store','direct'),
(10,'Acceso a práctica de bateo','direct'),
(12,'Pase doble a Zona Grill','direct'),
(14,'Visita guiada al Estadio Panamericano','direct'),
(16,'Pase doble a juego, dos invitados','direct'),
(18,'Invitado especial en CharrosTV','direct'),
(20,'Sorteo de bat de colección usado en juego','raffle'),
(22,'Pelota oficial autografiada','direct'),
(24,'35% de descuento en el próximo abono','direct'),
(26,'Jersey firmado por jugadores','direct'),
(28,'Lanzamiento de primera bola grupal','direct'),
(30,'Convivencia en Zona Grill con jugadores y asado','direct')
ON CONFLICT (milestone) DO UPDATE SET
  benefit = EXCLUDED.benefit,
  benefit_type = EXCLUDED.benefit_type;
