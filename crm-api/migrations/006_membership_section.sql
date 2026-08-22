-- Commercial section is intentionally distinct from the detailed historical
-- zone imported from the source workbook.
ALTER TABLE memberships
  ADD COLUMN section text
    CHECK (section IN ('VIP', 'Preferente', 'General'));

COMMENT ON COLUMN memberships.section IS
  'Commercial section selected in the CRM; does not replace the imported detailed zone.';
