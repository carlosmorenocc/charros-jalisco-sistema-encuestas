import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('el aprovisionamiento conserva solo las cuatro cuentas de consulta aprobadas',async() => {
  const source = await fs.readFile(new URL('../scripts/provision-users.js',import.meta.url),'utf8');
  for (const email of [
    'cesar.carrasco@charrosdejalisco.com',
    'mariette.duenas@charrosdejalisco.com',
    'esmeralda.ruvalcaba@charrosdejalisco.com',
    'pascual.aranda@charrosdejalisco.com'
  ]) assert.match(source,new RegExp(email.replaceAll('.','\\.')));
  assert.match(source,/Esmeralda Ruvalcaba/);
  assert.match(source,/Pascual Aranda/);
  assert.match(source,/WHERE role='operator' AND NOT \(email=ANY\(\$1::text\[\]\)\)/);
  assert.doesNotMatch(source,/mariette\.guillen@/);
  assert.doesNotMatch(source,/blanca\.rubalcaba@/);
  assert.doesNotMatch(source,/blanca\.ruvalcaba@/);
});
