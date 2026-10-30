UPDATE rewards_catalog
SET redeem_from_offset = 0
WHERE redeem_from_offset <> 0;

ALTER TABLE rewards_catalog
  ALTER COLUMN redeem_from_offset SET DEFAULT 0;

ALTER TABLE rewards_catalog
  ADD CONSTRAINT rewards_catalog_redeem_from_offset_check
  CHECK (redeem_from_offset >= 0);
