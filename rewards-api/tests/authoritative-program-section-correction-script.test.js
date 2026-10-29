import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('el prearranque aplica la correccion de secciones en transaccion y sin imprimir el secreto',async() => {
  const [script,packageText] = await Promise.all([
    fs.readFile(
      new URL('../scripts/apply-authoritative-program-section-correction.js',import.meta.url),
      'utf8'
    ),
    fs.readFile(new URL('../package.json',import.meta.url),'utf8')
  ]);
  const packageJson = JSON.parse(packageText);

  assert.match(
    script,
    /parseAuthoritativeProgramSectionCorrection\(\s*process\.env\.REWARDS_PROGRAM_SECTION_CORRECTION\s*\)/u
  );
  assert.match(
    script,
    /transaction\(\s*pool,\s*\(client\) => applyAuthoritativeProgramSectionCorrection\(client,correction\)\s*\)/u
  );
  assert.match(script,/console\.error\(safeProgramSectionCorrectionFailureLog\(error\)\)/u);
  assert.doesNotMatch(
    script,
    /console\.(?:log|error)\(\s*(?:correction|JSON\.stringify\(correction\))/u
  );
  assert.doesNotMatch(script,/console\.(?:log|error)\([^)]*error\.(?:message|stack)/u);
  assert.equal(
    packageJson.scripts.prestart,
    'node scripts/apply-authoritative-order-correction.js && node scripts/apply-authoritative-program-section-correction.js && node scripts/apply-program-enrollment.js'
  );
});
