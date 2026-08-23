import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { normalizeOperationalDataset } from '../src/lib/operationalDataset.js';
import { PgCrmRepository } from '../src/repositories/PgCrmRepository.js';

const { Pool } = pg;
const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const file = value('--file');
const confirmSha = value('--confirm-sha');
const commit = args.includes('--commit');
if (!file) throw new Error('OPERATIONAL_DATASET_FILE_REQUIRED');

const payload = JSON.parse(await fs.readFile(file, 'utf8'));
const dataset = normalizeOperationalDataset(payload);
process.stdout.write(`${JSON.stringify({ mode: commit ? 'commit' : 'dry-run', datasetSha256: dataset.datasetSha256, metrics: dataset.metrics })}\n`);
if (!commit) process.exit(0);
if (confirmSha !== dataset.datasetSha256) throw new Error('OPERATIONAL_DATASET_SHA_CONFIRMATION_REQUIRED');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true },
  max: 1,
  connectionTimeoutMillis: 15_000,
  statement_timeout: 60_000,
  application_name: 'charros-crm-operational-sync'
});
try {
  const admins = await pool.query(
    `SELECT id,email,display_name FROM app_users
     WHERE role='admin' AND active=true AND deleted_at IS NULL ORDER BY created_at`
  );
  if (admins.rowCount !== 1) throw new Error(`EXACTLY_ONE_ACTIVE_ADMIN_REQUIRED:${admins.rowCount}`);
  const actor = { id: admins.rows[0].id, email: admins.rows[0].email, displayName: admins.rows[0].display_name, role: 'admin' };
  const repository = new PgCrmRepository(pool);
  const result = await repository.synchronizeOperationalDataset(dataset, actor, {
    requestId: randomUUID(), ipHash: null, userAgent: 'controlled-local-operational-sync'
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await pool.end();
}
