import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('el prearranque aplica la corrección de asistencia en transacción sin imprimir el secreto',async() => {
  const [script,packageText] = await Promise.all([
    fs.readFile(new URL('../scripts/apply-attendance-correction.js',import.meta.url),'utf8'),
    fs.readFile(new URL('../package.json',import.meta.url),'utf8')
  ]);
  const packageJson = JSON.parse(packageText);

  assert.match(
    script,
    /parseAttendanceCorrection\(\s*process\.env\.REWARDS_ATTENDANCE_CORRECTION\s*\)/u
  );
  assert.match(
    script,
    /transaction\(\s*pool,\s*\(client\) => applyAttendanceCorrection\(client,correction\)\s*\)/u
  );
  assert.match(script,/console\.error\(safeAttendanceCorrectionFailureLog\(error\)\)/u);
  assert.match(
    script,
    /console\.log\(safeAttendanceCorrectionSuccessLog\(result\.status\)\)/u
  );
  assert.doesNotMatch(
    script,
    /console\.(?:log|error)\(\s*(?:correction|JSON\.stringify\(correction\))/u
  );
  assert.doesNotMatch(script,/console\.(?:log|error)\([^)]*error\.(?:message|stack)/u);
  assert.match(
    packageJson.scripts.prestart,
    /node scripts\/apply-attendance-correction\.js/u
  );
});
