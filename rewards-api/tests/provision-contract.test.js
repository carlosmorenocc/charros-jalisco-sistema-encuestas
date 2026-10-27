import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('el aprovisionamiento conserva solo las tres cuentas de consulta aprobadas',async() => {
  const source = await fs.readFile(new URL('../scripts/provision-users.js',import.meta.url),'utf8');
  for (const email of [
    'cesar.carrasco@charrosdejalisco.com',
    'mariette.duenas@charrosdejalisco.com',
    'blanca.rubalcaba@charrosdejalisco.com'
  ]) assert.match(source,new RegExp(email.replaceAll('.','\\.')));
  assert.match(source,/WHERE role='operator' AND NOT \(email=ANY\(\$1::text\[\]\)\)/);
  assert.doesNotMatch(source,/mariette\.guillen@/);
  assert.doesNotMatch(source,/esmeralda\.ruvalcaba@/);
});
