-- Keep executive labels consistent in selectors, sales and executive reports.
UPDATE app_users
SET display_name = upper(display_name),
    updated_at = now()
WHERE role = 'executive'
  AND deleted_at IS NULL
  AND display_name <> upper(display_name);

-- Carlos represents the online sales channel while remaining an assignment-only
-- profile (no local credential is created by this migration).
INSERT INTO app_users (email, display_name, role, active)
SELECT 'crm.assignment.carlos@charrosjalisco.com', 'CARLOS', 'executive', true
WHERE NOT EXISTS (
  SELECT 1 FROM app_users
  WHERE lower(email) = 'crm.assignment.carlos@charrosjalisco.com'
    AND deleted_at IS NULL
);

-- The approved BoletoMóvil cut used "VENTA EN LÍNEA" for Carlos. Earlier
-- imports did not recognize that label, so only those imported orders were left
-- without an executive. Reconcile them without touching manually entered sales.
UPDATE sales AS sale
SET executive_id = executive.id,
    updated_at = now()
FROM app_users AS executive
WHERE executive.email = 'crm.assignment.carlos@charrosjalisco.com'
  AND executive.deleted_at IS NULL
  AND sale.executive_id IS NULL
  AND sale.deleted_at IS NULL
  AND sale.notes LIKE 'BoletoMóvil orden %';

-- Keep the contact owner aligned with its online purchase when it is currently
-- unassigned. Existing explicit assignments are preserved.
UPDATE contacts AS contact
SET executive_id = executive.id,
    updated_at = now()
FROM app_users AS executive
WHERE executive.email = 'crm.assignment.carlos@charrosjalisco.com'
  AND executive.deleted_at IS NULL
  AND contact.executive_id IS NULL
  AND contact.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM sales AS sale
    WHERE sale.contact_id = contact.id
      AND sale.executive_id = executive.id
      AND sale.deleted_at IS NULL
  );
