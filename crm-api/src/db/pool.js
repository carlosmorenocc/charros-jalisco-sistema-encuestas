import pg from 'pg';

const { Pool } = pg;

export function createPool(config) {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
    ssl: config.databaseSsl ? { rejectUnauthorized: true } : false,
    application_name: 'charros-crm-api',
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000
  });

  pool.on('error', (error) => {
    // The caller-provided logger cannot be referenced before app composition.
    // This intentionally contains no query values or connection string.
    process.stderr.write(`Unexpected PostgreSQL pool error: ${error.code ?? 'UNKNOWN'}\n`);
  });
  return pool;
}

export async function withTransaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
