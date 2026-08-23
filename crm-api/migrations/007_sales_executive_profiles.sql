-- Assignment-only commercial profiles. They intentionally have no row in
-- local_credentials, so they cannot authenticate in the single-Admin release.
WITH executive_profiles (email, display_name) AS (
  VALUES
    ('crm.assignment.esmeralda@charrosjalisco.com', 'Esmeralda'),
    ('crm.assignment.jesus@charrosjalisco.com', 'Jesús'),
    ('crm.assignment.rosana@charrosjalisco.com', 'Rosana'),
    ('crm.assignment.carlos@charrosjalisco.com', 'Carlos'),
    ('crm.assignment.pascual@charrosjalisco.com', 'Pascual'),
    ('crm.assignment.cesar@charrosjalisco.com', 'Cesar')
)
INSERT INTO app_users (email, display_name, role, active)
SELECT profile.email, profile.display_name, 'executive', true
FROM executive_profiles profile
WHERE NOT EXISTS (
  SELECT 1
  FROM app_users existing
  WHERE lower(existing.email) = lower(profile.email)
    AND existing.deleted_at IS NULL
);
