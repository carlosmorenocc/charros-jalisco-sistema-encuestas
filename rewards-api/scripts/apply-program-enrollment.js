import { loadConfig } from '../src/config.js';
import { createPool, transaction } from '../src/db.js';
import {
  applyProgramEnrollment,
  parseProgramEnrollment,
  safeEnrollmentFailureLog
} from '../src/program-enrollment.js';

let pool;
try {
  const enrollment = parseProgramEnrollment(process.env.REWARDS_PROGRAM_ENROLLMENT);
  if (enrollment) {
    pool = createPool(loadConfig());
    const result = await transaction(pool,(client) => applyProgramEnrollment(client,enrollment));
    if (!['applied','already_applied'].includes(result.status)) {
      throw new Error('Unexpected enrollment status');
    }
    console.log('Exceptional program enrollment completed.');
  }
} catch (error) {
  console.error(safeEnrollmentFailureLog(error));
  process.exitCode = 1;
} finally {
  if (pool) await pool.end().catch(() => {});
}
