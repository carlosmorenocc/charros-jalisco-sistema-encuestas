-- La base operativa VIE 21 distingue "Por marcar" de cualquier gestión ya
-- iniciada. Los 91 registros fueron conciliados por nombre, correo y teléfono.
UPDATE contacts
SET commercial_stage = CASE
  WHEN external_ref IN (
    'LMP2627:REAL-0260', 'LMP2627:REAL-0261', 'LMP2627:REAL-0262',
    'LMP2627:REAL-0273', 'LMP2627:REAL-0278', 'LMP2627:REAL-0280',
    'LMP2627:REAL-0283', 'LMP2627:REAL-0284', 'LMP2627:REAL-0294',
    'LMP2627:REAL-0301', 'LMP2627:REAL-0305', 'LMP2627:REAL-0313',
    'LMP2627:REAL-0319', 'LMP2627:REAL-0320', 'LMP2627:REAL-0321',
    'LMP2627:REAL-0326'
  ) THEN 'to_contact'
  ELSE 'follow_up'
END
WHERE deleted_at IS NULL
  AND subscriber_status = 'renewing'
  AND external_ref LIKE 'LMP2627:REAL-%';

