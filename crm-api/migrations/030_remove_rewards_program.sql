-- Remove the rewards module that was accidentally deployed with migration 029.
-- This cleanup is intentionally guarded so it is a no-op on fresh databases and
-- refuses to discard any operator-created rewards data.
DO $$
DECLARE
  operational_rows bigint;
  credential_rows bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM schema_migrations
    WHERE filename = '029_rewards_program.sql'
  ) THEN
    RETURN;
  END IF;

  SELECT
    (SELECT count(*) FROM reward_programs) +
    (SELECT count(*) FROM reward_games) +
    (SELECT count(*) FROM reward_import_batches) +
    (SELECT count(*) FROM reward_attendance) +
    (SELECT count(*) FROM reward_coupon_deliveries) +
    (SELECT count(*) FROM reward_program_transfers) +
    (SELECT count(*) FROM reward_admin_corrections)
  INTO operational_rows;

  IF operational_rows <> 0 THEN
    RAISE EXCEPTION
      'Refusing rewards cleanup: % operational rows exist',
      operational_rows;
  END IF;

  IF EXISTS (SELECT 1 FROM app_users WHERE role = 'rewards_operator') THEN
    RAISE EXCEPTION 'Refusing rewards cleanup: rewards operators exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM user_permission_grants
    WHERE permission LIKE 'rewards.%'
  ) THEN
    RAISE EXCEPTION 'Refusing rewards cleanup: rewards permission grants exist';
  END IF;

  SELECT count(*) INTO credential_rows FROM local_credentials;
  IF credential_rows > 1 THEN
    RAISE EXCEPTION
      'Refusing auth constraint restoration: % local credentials exist',
      credential_rows;
  END IF;

  DROP TABLE reward_admin_corrections;
  DROP TABLE reward_program_transfers;
  DROP TABLE reward_coupon_deliveries;
  DROP TABLE reward_attendance;
  DROP TABLE reward_import_batches;
  DROP TABLE reward_definitions;
  DROP TABLE reward_games;
  DROP TABLE reward_programs;

  ALTER TABLE app_users DROP CONSTRAINT app_users_role_check;
  ALTER TABLE app_users ADD CONSTRAINT app_users_role_check
    CHECK (role IN ('direction', 'executive', 'supervisor', 'admin'));

  ALTER TABLE user_permission_grants
    DROP CONSTRAINT user_permission_grants_permission_check;
  ALTER TABLE user_permission_grants
    ADD CONSTRAINT user_permission_grants_permission_check
    CHECK (permission IN ('data.export', 'contact.delete', 'contact.restore'));

  ALTER TABLE local_credentials
    ADD COLUMN singleton boolean NOT NULL DEFAULT true;
  ALTER TABLE local_credentials
    ADD CONSTRAINT local_credentials_singleton_key UNIQUE (singleton);
  ALTER TABLE local_credentials
    ADD CONSTRAINT local_credentials_singleton_check CHECK (singleton = true);

  DELETE FROM schema_migrations
  WHERE filename = '029_rewards_program.sql';
END
$$;
