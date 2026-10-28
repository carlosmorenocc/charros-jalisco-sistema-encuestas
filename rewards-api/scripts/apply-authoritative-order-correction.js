import { loadConfig } from '../src/config.js';
import { createPool, transaction } from '../src/db.js';
import {
  applyAuthoritativeOrderCorrection,
  parseAuthoritativeOrderCorrection
} from '../src/authoritative-order-correction.js';

let pool;
try {
  const correction = parseAuthoritativeOrderCorrection(process.env.REWARDS_ORDER_CORRECTION);
  if (correction) {
    pool = createPool(loadConfig());
    const result = await transaction(pool,(client) => applyAuthoritativeOrderCorrection(client,correction));
    if (!['applied','already_applied'].includes(result.status)) throw new Error('Unexpected correction status');
    console.log('Authoritative order correction completed.');
  }
} catch {
  console.error('Authoritative order correction failed; the transaction was rolled back.');
  process.exitCode = 1;
} finally {
  if (pool) await pool.end().catch(() => {});
}
