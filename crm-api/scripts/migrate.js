import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { createPool, withTransaction } from '../src/db/pool.js';

const config = loadConfig();
const pool = createPool(config);
const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(here, '../migrations');

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function migrate() {
  const files = (await fs.readdir(migrationsDirectory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  await withTransaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [260027]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const applied = await client.query('SELECT filename, checksum FROM schema_migrations');
    const appliedByName = new Map(applied.rows.map((row) => [row.filename, row.checksum]));

    for (const filename of files) {
      const sql = await fs.readFile(path.join(migrationsDirectory, filename), 'utf8');
      const checksum = sha256(sql);
      if (appliedByName.has(filename)) {
        if (appliedByName.get(filename) !== checksum) {
          throw new Error(`Applied migration checksum changed: ${filename}`);
        }
        continue;
      }
      process.stdout.write(`Applying ${filename}\n`);
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
        [filename, checksum]
      );
    }
  });
}

try {
  await migrate();
  process.stdout.write('Migrations are current.\n');
} finally {
  await pool.end();
}
