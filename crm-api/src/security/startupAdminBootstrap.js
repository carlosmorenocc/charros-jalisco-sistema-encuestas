import crypto from 'node:crypto';
import { withTransaction } from '../db/pool.js';
import { assertPasswordPolicy, hashPassword } from './password.js';

export const STARTUP_ADMIN_ENV_KEYS = Object.freeze([
  'BOOTSTRAP_ADMIN_EMAIL',
  'BOOTSTRAP_ADMIN_NAME',
  'BOOTSTRAP_ADMIN_PASSWORD'
]);

const BOOTSTRAP_LOCK_ID = 2_600_271;

function readBootstrapIntent(env) {
  const configured = STARTUP_ADMIN_ENV_KEYS.filter((key) => Object.hasOwn(env, key));
  if (configured.length === 0) return null;

  const missing = STARTUP_ADMIN_ENV_KEYS.filter((key) => {
    if (!Object.hasOwn(env, key)) return true;
    const value = env[key];
    return typeof value !== 'string' || value.length === 0;
  });
  if (missing.length > 0) {
    throw new Error(`Startup Admin bootstrap is incomplete; set or remove together: ${missing.join(', ')}.`);
  }

  return {
    email: env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase(),
    displayName: env.BOOTSTRAP_ADMIN_NAME.trim(),
    // Do not trim or otherwise copy password material into diagnostics.
    password: env.BOOTSTRAP_ADMIN_PASSWORD
  };
}

export function clearStartupAdminSecrets(env = process.env) {
  for (const key of STARTUP_ADMIN_ENV_KEYS) delete env[key];
}

function validateIdentity(intent, localAdminDomain) {
  if (intent.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(intent.email)
    || !intent.email.endsWith(`@${localAdminDomain}`)) {
    throw new Error(`BOOTSTRAP_ADMIN_EMAIL must belong to ${localAdminDomain}.`);
  }
  if (!intent.displayName || intent.displayName.length > 160) {
    throw new Error('BOOTSTRAP_ADMIN_NAME must contain 1 to 160 characters.');
  }
}

/**
 * Creates the first and only local Admin when startup bootstrap variables are
 * present. An already-created matching Admin is an intentional no-op: retained
 * environment variables can never reset credentials during a cold start.
 */
export async function ensureStartupAdmin({
  pool,
  config,
  env = process.env,
  hashPasswordFn = hashPassword,
  randomUUID = crypto.randomUUID
}) {
  const intent = readBootstrapIntent(env);
  if (!intent) return { status: 'disabled' };
  validateIdentity(intent, config.localAdminDomain);

  return withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [BOOTSTRAP_LOCK_ID]);
    const existing = await client.query(
      `SELECT u.id,u.email,u.role,u.active,(c.user_id IS NOT NULL) AS has_credentials
       FROM app_users u
       LEFT JOIN local_credentials c ON c.user_id=u.id
       WHERE u.deleted_at IS NULL
       ORDER BY u.created_at,u.id
       FOR UPDATE OF u`
    );

    if (existing.rowCount > 0) {
      const user = existing.rows[0];
      const isExpectedSingleton = existing.rowCount === 1
        && user.active === true
        && user.role === 'admin'
        && user.has_credentials === true
        && String(user.email).toLowerCase() === intent.email;
      if (!isExpectedSingleton) {
        throw new Error('Startup Admin bootstrap refused: the database is not the expected single-Admin state.');
      }
      return { status: 'already_exists' };
    }

    // A credential attached to a deleted/legacy user would violate the singleton
    // model. Fail explicitly instead of attempting to overwrite or adopt it.
    const credentialCount = await client.query(
      'SELECT count(*)::integer AS count FROM local_credentials'
    );
    if (credentialCount.rows[0].count !== 0) {
      throw new Error('Startup Admin bootstrap refused: credential state exists without an active user.');
    }

    // Password policy and the expensive KDF run only for the zero-user creation
    // path. Restarts never validate, hash, replace, or otherwise touch the secret.
    const password = assertPasswordPolicy(intent.password);
    const passwordHash = await hashPasswordFn(password, config.passwordPepper);
    const created = await client.query(
      `INSERT INTO app_users (email,display_name,role,active)
       VALUES ($1,$2,'admin',true) RETURNING id`,
      [intent.email, intent.displayName]
    );
    await client.query(
      'INSERT INTO local_credentials (user_id,password_hash) VALUES ($1,$2)',
      [created.rows[0].id, passwordHash]
    );
    await client.query(
      `INSERT INTO audit_events
         (actor_id,action,entity_type,entity_id,request_id,metadata)
       VALUES ($1,'auth.admin_bootstrapped','auth',$2,$3,'{"source":"startup_env"}'::jsonb)`,
      [created.rows[0].id, String(created.rows[0].id), randomUUID()]
    );
    return { status: 'created' };
  });
}
