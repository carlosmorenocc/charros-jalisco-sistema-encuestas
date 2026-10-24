import crypto from 'node:crypto'
import { loadConfig } from '../src/config.js'
import { createPool, withTransaction } from '../src/db/pool.js'
import { assertPasswordPolicy, hashPassword } from '../src/security/password.js'

const config = loadConfig()
const pool = createPool(config)
const email = String(process.env.REWARDS_OPERATOR_EMAIL ?? '').trim().toLowerCase()
const displayName = String(process.env.REWARDS_OPERATOR_NAME ?? '').trim()
const password = assertPasswordPolicy(process.env.REWARDS_OPERATOR_PASSWORD)

if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  || !email.endsWith(`@${config.localAdminDomain}`)) {
  throw new Error(`REWARDS_OPERATOR_EMAIL must belong to ${config.localAdminDomain}.`)
}
if (!displayName || displayName.length > 160) {
  throw new Error('REWARDS_OPERATOR_NAME must contain 1 to 160 characters.')
}

const passwordHash = await hashPassword(password, config.passwordPepper)
try {
  const result = await withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [260_027_2])
    const existing = await client.query(
      `SELECT id,role FROM app_users WHERE lower(email)=lower($1) AND deleted_at IS NULL FOR UPDATE`,
      [email]
    )
    if (existing.rowCount && existing.rows[0].role !== 'rewards_operator') {
      throw new Error('The email already belongs to a non-rewards account.')
    }
    const userId = existing.rows[0]?.id ?? (await client.query(
      `INSERT INTO app_users (email,display_name,role,active)
       VALUES ($1,$2,'rewards_operator',true) RETURNING id`,
      [email, displayName]
    )).rows[0].id
    await client.query(
      `INSERT INTO local_credentials (user_id,password_hash) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET password_hash=excluded.password_hash,password_changed_at=now()`,
      [userId, passwordHash]
    )
    await client.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1', [userId])
    await client.query(
      `INSERT INTO audit_events (actor_id,action,entity_type,entity_id,request_id,metadata)
       VALUES ($1,'auth.rewards_operator_provisioned','auth',$2,$3,'{"source":"cli"}'::jsonb)`,
      [userId, String(userId), crypto.randomUUID()]
    )
    return userId
  })
  process.stdout.write(`Rewards operator provisioned; id ${result}.\n`)
  process.stdout.write('Remove REWARDS_OPERATOR_PASSWORD from the command environment now.\n')
} finally {
  await pool.end()
}
