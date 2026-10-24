CREATE TABLE rewards_seasons (
  code text PRIMARY KEY,
  display_name text NOT NULL,
  regular_season_games integer NOT NULL CHECK (regular_season_games > 0),
  playoffs_included boolean NOT NULL DEFAULT false,
  closes_on date,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO rewards_seasons(code,display_name,regular_season_games,playoffs_included)
VALUES('LMP-2026-27','LMP 2026–2027',34,false);

ALTER TABLE rewards_programs
  ADD CONSTRAINT rewards_programs_season_fk
  FOREIGN KEY (season_code) REFERENCES rewards_seasons(code);
