-- Rename the assignment-only Carlos profile to the EN LINEA sales channel.
UPDATE app_users
SET display_name = 'EN LINEA',
    updated_at = now()
WHERE lower(email) = 'crm.assignment.carlos@charrosjalisco.com'
  AND deleted_at IS NULL
  AND display_name IS DISTINCT FROM 'EN LINEA';
