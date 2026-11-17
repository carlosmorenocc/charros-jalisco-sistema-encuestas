import { loadConfig } from '../src/config.js';
import { createPool, transaction } from '../src/db.js';
import {
  applyAttendanceCorrection,
  parseAttendanceCorrection,
  safeAttendanceCorrectionFailureLog,
  safeAttendanceCorrectionSuccessLog
} from '../src/attendance-correction.js';

let pool;
try {
  const correction = parseAttendanceCorrection(
    process.env.REWARDS_ATTENDANCE_CORRECTION
  );
  if (correction) {
    pool = createPool(loadConfig());
    const result = await transaction(
      pool,
      (client) => applyAttendanceCorrection(client,correction)
    );
    console.log(safeAttendanceCorrectionSuccessLog(result.status));
  }
} catch (error) {
  console.error(safeAttendanceCorrectionFailureLog(error));
  process.exitCode = 1;
} finally {
  if (pool) await pool.end().catch(() => {});
}
