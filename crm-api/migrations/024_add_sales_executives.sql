-- Assignment-only commercial profiles. They are available throughout the CRM
-- but intentionally receive no local credential or permission grant.
WITH new_executives (email, display_name) AS (
  VALUES
    ('crm.assignment.julissa.carranza@charrosjalisco.com', 'JULISSA CARRANZA'),
    ('crm.assignment.daniela.velazquez@charrosjalisco.com', 'DANIELA VÉLAZQUEZ')
)
INSERT INTO app_users (email, display_name, role, active)
SELECT profile.email, profile.display_name, 'executive', true
FROM new_executives profile
WHERE NOT EXISTS (
  SELECT 1
  FROM app_users existing
  WHERE lower(existing.email) = lower(profile.email)
    AND existing.deleted_at IS NULL
);

-- Keep a previously provisioned assignment profile aligned and active if an
-- environment already created it before this migration was deployed.
WITH new_executives (email, display_name) AS (
  VALUES
    ('crm.assignment.julissa.carranza@charrosjalisco.com', 'JULISSA CARRANZA'),
    ('crm.assignment.daniela.velazquez@charrosjalisco.com', 'DANIELA VÉLAZQUEZ')
)
UPDATE app_users existing
SET display_name = profile.display_name,
    role = 'executive',
    active = true,
    updated_at = now()
FROM new_executives profile
WHERE lower(existing.email) = lower(profile.email)
  AND existing.deleted_at IS NULL
  AND (existing.display_name, existing.role, existing.active)
      IS DISTINCT FROM (profile.display_name, 'executive', true);
