-- Versioned commercial price book for LMP 2026-2027. Historical memberships
-- remain valid with a completely null pricing snapshot until explicitly edited.
CREATE TABLE membership_price_books (
  version text PRIMARY KEY,
  season_code text NOT NULL REFERENCES seasons(code),
  display_name text NOT NULL,
  currency text NOT NULL CHECK (currency = 'MXN'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX membership_price_books_one_active_season
  ON membership_price_books (season_code) WHERE active;

CREATE TABLE membership_locality_prices (
  price_book_version text NOT NULL REFERENCES membership_price_books(version),
  code text NOT NULL,
  display_name text NOT NULL,
  section text NOT NULL CHECK (section IN ('VIP', 'Preferente', 'General')),
  list_unit_price bigint NOT NULL CHECK (list_unit_price > 0),
  july25_unit_price bigint NOT NULL CHECK (july25_unit_price > 0),
  july25_mode text NOT NULL CHECK (july25_mode IN ('official_unit', 'two_for_one')),
  promotion_label text,
  sort_order integer NOT NULL CHECK (sort_order > 0),
  PRIMARY KEY (price_book_version, code),
  UNIQUE (price_book_version, sort_order)
);

CREATE TABLE membership_discount_campaigns (
  price_book_version text NOT NULL REFERENCES membership_price_books(version),
  code text NOT NULL,
  display_name text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('regular', 'percentage', 'catalog_official')),
  rate_basis_points integer,
  selectable boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL CHECK (sort_order > 0),
  PRIMARY KEY (price_book_version, code),
  UNIQUE (price_book_version, sort_order),
  CHECK (
    (mode = 'regular' AND rate_basis_points = 0)
    OR (mode = 'percentage' AND rate_basis_points BETWEEN 1 AND 9999)
    OR (mode = 'catalog_official' AND rate_basis_points IS NULL)
  )
);

INSERT INTO membership_price_books (version,season_code,display_name,currency)
VALUES ('LMP-2026-27-v1','LMP-2026-27','Abonos LMP 2026-2027','MXN');

-- Monetary amounts are integer centavos (MXN).
INSERT INTO membership_locality_prices
  (price_book_version,code,display_name,section,list_unit_price,july25_unit_price,july25_mode,promotion_label,sort_order)
VALUES
  ('LMP-2026-27-v1','vip','VIP','VIP',2992000,2244000,'official_unit',NULL,1),
  ('LMP-2026-27-v1','vip_lateral','VIP Lateral','VIP',2686000,2014500,'official_unit',NULL,2),
  ('LMP-2026-27-v1','premier_1_3','Premier 1a-3a','Preferente',2244000,1683000,'official_unit',NULL,3),
  ('LMP-2026-27-v1','planta_baja_central','Planta Baja Central','Preferente',1598000,1198500,'official_unit',NULL,4),
  ('LMP-2026-27-v1','lateral_premier_1_3','Lateral Premier 1a-3a','Preferente',1410000,1058200,'official_unit',NULL,5),
  ('LMP-2026-27-v1','butaca_preferente_1_3','Butaca Preferente 1a-3a','Preferente',1224000,918000,'official_unit',NULL,6),
  ('LMP-2026-27-v1','planta_baja_1_3','Planta Baja 1a-3a','Preferente',1105000,828700,'official_unit',NULL,7),
  ('LMP-2026-27-v1','lateral_preferente_1_3','Lateral Preferente 1a-3a','General',816000,612000,'official_unit',NULL,8),
  ('LMP-2026-27-v1','lateral_1_3','Lateral 1a-3a','General',748000,748000,'two_for_one','2x1: una unidad bonificada por cada unidad con cargo',9),
  ('LMP-2026-27-v1','planta_alta_1_3','Planta Alta 1a-3a','General',561000,420700,'official_unit',NULL,10);

INSERT INTO membership_discount_campaigns
  (price_book_version,code,display_name,mode,rate_basis_points,sort_order)
VALUES
  ('LMP-2026-27-v1','regular','Sin descuento','regular',0,1),
  ('LMP-2026-27-v1','discount30','30% de descuento','percentage',3000,2),
  ('LMP-2026-27-v1','july25','Julio 2026 - precio especial','catalog_official',NULL,3),
  ('LMP-2026-27-v1','discount20','20% de descuento','percentage',2000,4);

ALTER TABLE memberships
  ADD COLUMN price_book_version text REFERENCES membership_price_books(version),
  ADD COLUMN currency text,
  ADD COLUMN locality_code text,
  ADD COLUMN locality_name text,
  ADD COLUMN discount_code text,
  ADD COLUMN discount_name text,
  ADD COLUMN pricing_mode text,
  ADD COLUMN list_unit_price bigint,
  ADD COLUMN commercial_value bigint,
  ADD COLUMN net_amount bigint,
  ADD COLUMN discount_amount bigint,
  ADD COLUMN effective_unit_price bigint,
  ADD COLUMN charged_units integer,
  ADD COLUMN bonus_units integer,
  ADD CONSTRAINT memberships_pricing_snapshot_valid CHECK (
    (price_book_version IS NULL
      AND currency IS NULL AND locality_code IS NULL AND locality_name IS NULL
      AND discount_code IS NULL AND discount_name IS NULL AND pricing_mode IS NULL
      AND list_unit_price IS NULL AND commercial_value IS NULL AND net_amount IS NULL
      AND discount_amount IS NULL AND effective_unit_price IS NULL
      AND charged_units IS NULL AND bonus_units IS NULL)
    OR
    (price_book_version IS NOT NULL
      AND currency = 'MXN' AND locality_code IS NOT NULL AND locality_name IS NOT NULL
      AND discount_code IS NOT NULL AND discount_name IS NOT NULL AND pricing_mode IS NOT NULL
      AND list_unit_price > 0 AND commercial_value = list_unit_price * seat_count
      AND net_amount >= 0 AND net_amount <= commercial_value
      AND discount_amount = commercial_value - net_amount
      AND effective_unit_price >= 0
      AND charged_units >= 0 AND bonus_units >= 0
      AND charged_units + bonus_units = seat_count)
  );

COMMENT ON COLUMN memberships.commercial_value IS
  'Snapshot of regular list value in integer centavos; it is not collected revenue or profit.';
COMMENT ON COLUMN memberships.net_amount IS
  'Snapshot of contractual commercial amount in integer centavos; it is not payment status.';
