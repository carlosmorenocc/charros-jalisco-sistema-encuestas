CREATE TABLE rewards_holders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  email text,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rewards_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_code text NOT NULL,
  order_number text NOT NULL,
  purchase_code text,
  buyer_holder_id uuid,
  seller text,
  discount_label text,
  purchased_at timestamptz,
  payment_type text,
  source_event text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rewards_orders_season_fk
    FOREIGN KEY (season_code) REFERENCES rewards_seasons(code) ON DELETE RESTRICT,
  CONSTRAINT rewards_orders_buyer_holder_fk
    FOREIGN KEY (buyer_holder_id) REFERENCES rewards_holders(id) ON DELETE SET NULL,
  CONSTRAINT rewards_orders_season_order_unique
    UNIQUE (season_code,order_number)
);

ALTER TABLE rewards_programs
  ADD COLUMN holder_id uuid,
  ADD COLUMN order_id uuid,
  ADD COLUMN source_reference text,
  ADD CONSTRAINT rewards_programs_holder_fk
    FOREIGN KEY (holder_id) REFERENCES rewards_holders(id) ON DELETE SET NULL,
  ADD CONSTRAINT rewards_programs_order_fk
    FOREIGN KEY (order_id) REFERENCES rewards_orders(id) ON DELETE SET NULL;

CREATE INDEX rewards_programs_holder_idx
  ON rewards_programs(holder_id)
  WHERE holder_id IS NOT NULL;

CREATE INDEX rewards_programs_order_idx
  ON rewards_programs(order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX rewards_programs_source_reference_idx
  ON rewards_programs(source_reference)
  WHERE source_reference IS NOT NULL;
