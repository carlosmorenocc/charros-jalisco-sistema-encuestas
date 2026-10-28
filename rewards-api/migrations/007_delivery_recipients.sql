ALTER TABLE rewards_deliveries
  ADD COLUMN recipient_name text;

ALTER TABLE rewards_deliveries
  ADD CONSTRAINT rewards_deliveries_recipient_name_check
  CHECK (
    recipient_name IS NULL
    OR (
      recipient_name = btrim(recipient_name)
      AND char_length(recipient_name) BETWEEN 1 AND 120
      AND recipient_name !~ '[[:cntrl:]]'
    )
  );
