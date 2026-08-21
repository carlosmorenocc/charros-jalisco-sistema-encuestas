import crypto from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createPool, withTransaction } from '../src/db/pool.js';
import { assertPasswordPolicy, hashPassword } from '../src/security/password.js';

const config = loadConfig();
const pool = createPool(config);
const reset = process.argv.includes('--reset');
const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
const displayName = String(process.env.BOOTSTRAP_ADMIN_NAME ?? '').trim();
const password = assertPasswordPolicy(process.env.BOOTSTRAP_ADMIN_PASSWORD);

if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  || !email.endsWith(`@${config.localAdminDomain}`)) {
  throw new Error(`BOOTSTRAP_ADMIN_EMAIL must belong to ${config.localAdminDomain}.`);
}
if (!reset && (!displayName || displayName.length > 160)) {
  throw new Error('BOOTSTRAP_ADMIN_NAME must contain 1 to 160 characters.');
}

const passwordHash = await hashPassword(password, config.passwordPepper);

try {
  const result = await withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [260_027_1]);
    if (!reset) {
      const existing = await client.query(
        'SELECT count(*)::integer AS count FROM app_users WHERE deleted_at IS NULL'
      );
      if (existing.rows[0].count !== 0) {
        throw new Error('Bootstrap is allowed only when app_users contains zero non-deleted users.');
      }
      const created = await client.query(
        `INSERT INTO app_users (email,display_name,role,active)
         VALUES ($1,$2,'admin',true) RETURNING id`,
        [email, displayName]
      );
      await client.query(
        'INSERT INTO local_credentials (user_id,password_hash) VALUES ($1,$2)',
        [created.rows[0].id, passwordHash]
      );
      await client.query(
        `INSERT INTO audit_events
           (actor_id,action,entity_type,entity_id,request_id,metadata)
         VALUES ($1,'auth.admin_bootstrapped','auth',$1,$2,'{"source":"cli"}'::jsonb)`,
        [created.rows[0].id, crypto.randomUUID()]
      );
      return { id: created.rows[0].id, action: 'created' };
    }

    const existing = await client.query(
      `SELECT u.id,u.email FROM app_users u JOIN local_credentials c ON c.user_id=u.id
       WHERE u.active=true AND u.deleted_at IS NULL AND u.role='admin' FOR UPDATE`
    );
    if (existing.rowCount !== 1 || existing.rows[0].email.toLowerCase() !== email) {
      throw new Error('Reset requires the exact email of the single active local administrator.');
    }
    const userId = existing.rows[0].id;
    await client.query(
      `UPDATE local_credentials SET password_hash=$2,password_changed_at=now()
       WHERE user_id=$1`,
      [userId, passwordHash]
    );
    await client.query(
      'UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1',
      [userId]
    );
    await client.query(
      `INSERT INTO audit_events
         (actor_id,action,entity_type,entity_id,request_id,metadata)
       VALUES ($1,'auth.password_reset','auth',$1,$2,'{"source":"cli"}'::jsonb)`,
      [userId, crypto.randomUUID()]
    );
    return { id: userId, action: 'reset' };
  });
  process.stdout.write(`Local administrator ${result.action}; id ${result.id}.\n`);
  process.stdout.write('Remove BOOTSTRAP_ADMIN_PASSWORD from the command environment now.\n');
} finally {
  await pool.end();
}
