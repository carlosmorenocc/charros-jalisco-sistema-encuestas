import { loadConfig } from '../src/config.js';
import { createPool, transaction } from '../src/db.js';
import {
  applyAuthoritativeProgramSectionCorrection,
  parseAuthoritativeProgramSectionCorrection,
  safeProgramSectionCorrectionFailureLog
} from '../src/authoritative-program-section-correction.js';

let pool;
try {
  const correction = parseAuthoritativeProgramSectionCorrection(
    process.env.REWARDS_PROGRAM_SECTION_CORRECTION
  );
  if (correction) {
    pool = createPool(loadConfig());
    const result = await transaction(
      pool,
      (client) => applyAuthoritativeProgramSectionCorrection(client,correction)
    );
    if (!['applied','already_applied'].includes(result.status)) {
      throw new Error('Unexpected correction status');
    }
    console.log('Authoritative program section correction completed.');
  }
} catch (error) {
  console.error(safeProgramSectionCorrectionFailureLog(error));
  process.exitCode = 1;
} finally {
  if (pool) await pool.end().catch(() => {});
}
