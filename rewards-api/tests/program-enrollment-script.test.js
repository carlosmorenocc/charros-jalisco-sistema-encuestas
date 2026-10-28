import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('el prearranque aplica el secreto dentro de una transacción y no imprime su contenido',async() => {
  const [script,packageText] = await Promise.all([
    fs.readFile(new URL('../scripts/apply-program-enrollment.js',import.meta.url),'utf8'),
    fs.readFile(new URL('../package.json',import.meta.url),'utf8')
  ]);
  const packageJson = JSON.parse(packageText);

  assert.match(script,/parseProgramEnrollment\(process\.env\.REWARDS_PROGRAM_ENROLLMENT\)/u);
  assert.match(
    script,
    /transaction\(pool,\(client\) => applyProgramEnrollment\(client,enrollment\)\)/u
  );
  assert.match(script,/console\.error\(safeEnrollmentFailureLog\(error\)\)/u);
  assert.doesNotMatch(
    script,
    /console\.(?:log|error)\(\s*(?:enrollment|JSON\.stringify\(enrollment\))/u
  );
  assert.doesNotMatch(script,/console\.(?:log|error)\([^)]*error\.(?:message|stack)/u);
  assert.equal(
    packageJson.scripts.prestart,
    'node scripts/apply-authoritative-order-correction.js && node scripts/apply-program-enrollment.js'
  );
});
