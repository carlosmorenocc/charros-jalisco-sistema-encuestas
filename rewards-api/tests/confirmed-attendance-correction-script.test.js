import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('el prearranque aplica la asistencia confirmada sin imprimir el secreto',async() => {
  const [script,packageText] = await Promise.all([
    fs.readFile(
      new URL('../scripts/apply-confirmed-attendance-correction.js',import.meta.url),
      'utf8'
    ),
    fs.readFile(new URL('../package.json',import.meta.url),'utf8')
  ]);
  const packageJson = JSON.parse(packageText);

  assert.match(
    script,
    /parseConfirmedAttendanceCorrection\(\s*process\.env\.REWARDS_CONFIRMED_ATTENDANCE_CORRECTION\s*\)/u
  );
  assert.match(
    script,
    /transaction\(\s*pool,\s*\(client\) => applyConfirmedAttendanceCorrection\(client,correction\)\s*\)/u
  );
  assert.match(script,/console\.error\(safeConfirmedAttendanceFailureLog\(error\)\)/u);
  assert.match(
    script,
    /console\.log\(safeConfirmedAttendanceSuccessLog\(result\.status\)\)/u
  );
  assert.doesNotMatch(
    script,
    /console\.(?:log|error)\(\s*(?:correction|JSON\.stringify\(correction\))/u
  );
  assert.doesNotMatch(script,/console\.(?:log|error)\([^)]*error\.(?:message|stack)/u);
  assert.match(
    packageJson.scripts.prestart,
    /node scripts\/apply-confirmed-attendance-correction\.js$/u
  );
});
