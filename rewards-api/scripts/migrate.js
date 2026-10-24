import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { createPool, transaction } from '../src/db.js';

const pool = createPool(loadConfig());
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
try {
  await transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [262027]);
    await client.query('CREATE TABLE IF NOT EXISTS rewards_schema_migrations(filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = new Map((await client.query('SELECT filename,checksum FROM rewards_schema_migrations')).rows.map((row) => [row.filename,row.checksum]));
    for (const filename of (await fs.readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()) {
      const sql = await fs.readFile(path.join(directory, filename), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      if (applied.has(filename)) {
        if (applied.get(filename) !== checksum) throw new Error(`Migration checksum changed: ${filename}`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO rewards_schema_migrations(filename,checksum) VALUES($1,$2)', [filename,checksum]);
    }
  });
  console.log('Rewards migrations are current.');
} finally { await pool.end(); }
