-- Programa de Recompensas LMP 2026-27. The module shares infrastructure but
-- not CRM data permissions: operators only see the purpose-built projections.

ALTER TABLE app_users DROP CONSTRAINT app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('direction','executive','supervisor','admin','rewards_operator'));

ALTER TABLE local_credentials DROP CONSTRAINT local_credentials_singleton_key;
ALTER TABLE local_credentials DROP CONSTRAINT local_credentials_singleton_check;
ALTER TABLE local_credentials DROP COLUMN singleton;

ALTER TABLE user_permission_grants DROP CONSTRAINT user_permission_grants_permission_check;
ALTER TABLE user_permission_grants ADD CONSTRAINT user_permission_grants_permission_check
  CHECK (permission IN (
    'data.export','contact.delete','contact.restore',
    'rewards.read','rewards.coupon.deliver','rewards.import','rewards.admin','rewards.export'
  ));

CREATE TABLE reward_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_code text NOT NULL REFERENCES seasons(code),
  internal_reference text NOT NULL UNIQUE,
  holder_display_name text NOT NULL,
  source_order_number text NOT NULL,
  zone text NOT NULL,
  section text NOT NULL,
  seat text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','review')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version integer NOT NULL DEFAULT 1,
  UNIQUE (season_code, source_order_number, zone, section, seat)
);

CREATE TABLE reward_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_code text NOT NULL REFERENCES seasons(code),
  played_on date NOT NULL,
  display_name text NOT NULL,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  report_status text NOT NULL DEFAULT 'partial' CHECK (report_status IN ('partial','closed')),
  closed_at timestamptz,
  UNIQUE (season_code, played_on),
  UNIQUE (season_code, sequence_number),
  CHECK ((report_status='closed') = (closed_at IS NOT NULL))
);

CREATE TABLE reward_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind text NOT NULL CHECK (source_kind IN ('sales','access')),
  source_sha256 char(64) NOT NULL,
  original_filename text NOT NULL,
  game_id uuid REFERENCES reward_games(id),
  report_status text CHECK (report_status IN ('partial','closed')),
  status text NOT NULL CHECK (status IN ('previewed','imported','rejected')),
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  UNIQUE (source_sha256)
);

CREATE TABLE reward_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES reward_programs(id),
  game_id uuid NOT NULL REFERENCES reward_games(id),
  first_import_batch_id uuid NOT NULL REFERENCES reward_import_batches(id),
  evidence_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, game_id)
);

CREATE TABLE reward_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_code text NOT NULL REFERENCES seasons(code),
  milestone_visits integer NOT NULL CHECK (milestone_visits BETWEEN 1 AND 100),
  benefit_name text NOT NULL,
  redemption_delay_visits integer NOT NULL DEFAULT 1 CHECK (redemption_delay_visits BETWEEN 0 AND 10),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (season_code, milestone_visits)
);

INSERT INTO reward_definitions (season_code,milestone_visits,benefit_name) VALUES
('LMP-2026-27',2,'Cerveza doble de cortesía'),
('LMP-2026-27',4,'2 cervezas Charros Brew en concesión'),
('LMP-2026-27',6,'Destilado de cortesía'),
('LMP-2026-27',8,'20% de descuento en Charros Team Store'),
('LMP-2026-27',10,'Acceso a práctica de bateo'),
('LMP-2026-27',12,'Pase doble a Zona Grill'),
('LMP-2026-27',14,'Visita guiada al Estadio Panamericano'),
('LMP-2026-27',16,'Pase doble a juego, dos invitados'),
('LMP-2026-27',18,'Sorteo de invitado especial en CharrosTV'),
('LMP-2026-27',20,'Sorteo de bat de colección usado en juego'),
('LMP-2026-27',22,'Pelota oficial autografiada'),
('LMP-2026-27',24,'35% de descuento en el próximo abono'),
('LMP-2026-27',26,'Jersey firmado por jugadores'),
('LMP-2026-27',28,'Lanzamiento de primera bola grupal'),
('LMP-2026-27',30,'Convivencia en Zona Grill con jugadores y asado');

CREATE TABLE reward_coupon_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES reward_programs(id),
  reward_definition_id uuid NOT NULL REFERENCES reward_definitions(id),
  status text NOT NULL CHECK (status IN ('delivered','historical_unreviewed','reversed')),
  delivered_at timestamptz,
  delivered_by uuid REFERENCES app_users(id),
  source text NOT NULL CHECK (source IN ('operator','historical','exception')),
  reason text,
  reversed_at timestamptz,
  reversed_by uuid REFERENCES app_users(id),
  reversal_reason text,
  idempotency_key uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'delivered' OR (delivered_at IS NOT NULL AND delivered_by IS NOT NULL)),
  CHECK (status <> 'reversed' OR (reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND length(trim(reversal_reason)) >= 5))
);

CREATE UNIQUE INDEX reward_coupon_one_active_delivery
  ON reward_coupon_deliveries (program_id,reward_definition_id)
  WHERE status='delivered';
CREATE UNIQUE INDEX reward_coupon_idempotency
  ON reward_coupon_deliveries (delivered_by,idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE reward_program_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES reward_programs(id),
  from_zone text NOT NULL,
  from_section text NOT NULL,
  from_seat text NOT NULL,
  to_zone text NOT NULL,
  to_section text NOT NULL,
  to_seat text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) >= 5),
  transferred_by uuid NOT NULL REFERENCES app_users(id),
  transferred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reward_admin_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid REFERENCES reward_programs(id),
  correction_type text NOT NULL CHECK (correction_type IN ('attendance_add','attendance_remove','eligibility','seat_transfer','coupon_reversal')),
  reason text NOT NULL CHECK (length(trim(reason)) >= 5),
  before_state jsonb,
  after_state jsonb,
  corrected_by uuid NOT NULL REFERENCES app_users(id),
  corrected_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reward_program_search_idx ON reward_programs (season_code,zone,status);
CREATE INDEX reward_attendance_program_idx ON reward_attendance (program_id,game_id);
CREATE INDEX reward_import_game_idx ON reward_import_batches (game_id,created_at DESC);
