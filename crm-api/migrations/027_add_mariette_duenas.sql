-- Assignment-only commercial profile. It is available throughout the CRM
-- but intentionally receives no local credential or permission grant.
INSERT INTO app_users (email, display_name, role, active)
SELECT
  'crm.assignment.mariette.duenas@charrosjalisco.com',
  'MARIETTE DUEÑAS',
  'executive',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM app_users existing
  WHERE lower(existing.email) = lower('crm.assignment.mariette.duenas@charrosjalisco.com')
    AND existing.deleted_at IS NULL
);

-- Keep the profile aligned and active if an environment provisioned it before
-- this migration was deployed.
UPDATE app_users
SET display_name = 'MARIETTE DUEÑAS',
    role = 'executive',
    active = true,
    updated_at = now()
WHERE lower(email) = lower('crm.assignment.mariette.duenas@charrosjalisco.com')
  AND deleted_at IS NULL
  AND (display_name, role, active)
      IS DISTINCT FROM ('MARIETTE DUEÑAS', 'executive', true);
