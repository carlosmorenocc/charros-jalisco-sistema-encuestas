import { loadConfig } from '../src/config.js';
import { createPool, transaction } from '../src/db.js';
import {
  applyConfirmedAttendanceCorrection,
  parseConfirmedAttendanceCorrection,
  safeConfirmedAttendanceFailureLog,
  safeConfirmedAttendanceSuccessLog
} from '../src/confirmed-attendance-correction.js';

let pool;
try {
  const correction = parseConfirmedAttendanceCorrection(
    process.env.REWARDS_CONFIRMED_ATTENDANCE_CORRECTION
  );
  if (correction) {
    pool = createPool(loadConfig());
    const result = await transaction(
      pool,
      (client) => applyConfirmedAttendanceCorrection(client,correction)
    );
    console.log(safeConfirmedAttendanceSuccessLog(result.status));
  }
} catch (error) {
  console.error(safeConfirmedAttendanceFailureLog(error));
  process.exitCode = 1;
} finally {
  if (pool) await pool.end().catch(() => {});
}
