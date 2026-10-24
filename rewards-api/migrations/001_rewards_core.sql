CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE rewards_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('administrator','operator')),
  password_hash text,
  must_change_password boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rewards_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES rewards_users(id) ON DELETE CASCADE,
  token_digest char(64) NOT NULL UNIQUE,
  csrf_digest char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rewards_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permanent_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  season_code text NOT NULL DEFAULT 'LMP-2026-27',
  order_number text NOT NULL,
  purchase_code text,
  holder_name text NOT NULL,
  holder_email text,
  holder_phone text,
  zone text NOT NULL,
  section text NOT NULL,
  seat text NOT NULL,
  barcode text,
  source_event text NOT NULL,
  eligibility_status text NOT NULL DEFAULT 'eligible' CHECK (eligibility_status IN ('eligible','review','excluded')),
  manual_lock boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_code, order_number, zone, section, seat)
);

CREATE TABLE rewards_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  played_on date NOT NULL UNIQUE,
  display_name text NOT NULL,
  sequence_number integer NOT NULL UNIQUE,
  report_status text NOT NULL CHECK (report_status IN ('partial','closed')),
  data_cutoff_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rewards_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('sales','access')),
  sha256 char(64) NOT NULL UNIQUE,
  original_filename text NOT NULL,
  game_id uuid REFERENCES rewards_games(id),
  report_status text CHECK (report_status IN ('partial','closed')),
  summary jsonb NOT NULL,
  imported_by uuid NOT NULL REFERENCES rewards_users(id),
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rewards_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES rewards_programs(id),
  game_id uuid NOT NULL REFERENCES rewards_games(id),
  first_import_id uuid NOT NULL REFERENCES rewards_imports(id),
  scanned_at timestamptz NOT NULL,
  barcode text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, game_id)
);

CREATE TABLE rewards_catalog (
  milestone integer PRIMARY KEY CHECK (milestone BETWEEN 1 AND 30),
  benefit text NOT NULL,
  benefit_type text NOT NULL CHECK (benefit_type IN ('direct','raffle')),
  redeem_from_offset integer NOT NULL DEFAULT 1
);

CREATE TABLE rewards_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES rewards_programs(id),
  milestone integer NOT NULL REFERENCES rewards_catalog(milestone),
  status text NOT NULL CHECK (status IN ('delivered','historical_unreviewed','reversed')),
  delivered_at timestamptz,
  delivered_by uuid REFERENCES rewards_users(id),
  known_date boolean NOT NULL DEFAULT true,
  reason text,
  idempotency_key uuid,
  reversed_at timestamptz,
  reversed_by uuid REFERENCES rewards_users(id),
  reversal_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX rewards_delivery_active_unique ON rewards_deliveries(program_id,milestone) WHERE status <> 'reversed';
CREATE UNIQUE INDEX rewards_delivery_idempotency_unique ON rewards_deliveries(delivered_by,idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE rewards_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES rewards_programs(id),
  from_location jsonb NOT NULL,
  to_location jsonb NOT NULL,
  reason text NOT NULL,
  actor_id uuid NOT NULL REFERENCES rewards_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rewards_audit (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES rewards_users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO rewards_catalog(milestone,benefit,benefit_type) VALUES
(2,'Cerveza doble de cortesía','direct'),(4,'Dos cervezas Charros Brew en concesión','direct'),
(6,'Destilado de cortesía','direct'),(8,'20% de descuento en Charros Team Store','direct'),
(10,'Acceso a práctica de bateo','direct'),(12,'Pase doble a Zona Grill','direct'),
(14,'Visita guiada al Estadio Panamericano','direct'),(16,'Pase doble a juego, dos invitados','direct'),
(18,'Sorteo de invitado especial en CharrosTV','raffle'),(20,'Sorteo de bat de colección usado en juego','raffle'),
(22,'Pelota oficial autografiada','direct'),(24,'35% de descuento en el próximo abono','direct'),
(26,'Jersey firmado por jugadores','direct'),(28,'Lanzamiento de primera bola grupal','direct'),
(30,'Convivencia en Zona Grill con jugadores y asado','direct');

INSERT INTO rewards_games(played_on,display_name,sequence_number,report_status) VALUES
('2026-10-13','Inauguración: Jaguares vs Charros',1,'closed'),
('2026-10-20','J1: Águilas de Mexicali vs Charros',2,'closed'),
('2026-10-21','J2: Águilas de Mexicali vs Charros',3,'closed'),
('2026-10-22','J3: Águilas de Mexicali vs Charros',4,'closed');
