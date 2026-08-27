import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryUrl = new URL('../src/repositories/PgCrmRepository.js', import.meta.url);

test('cada venta ganada crea un abono independiente asociado al número de orden', async () => {
  const repository = await readFile(repositoryUrl, 'utf8');
  const createSale = repository.slice(
    repository.indexOf('async createSale('),
    repository.indexOf('async correctSale(')
  );

  assert.doesNotMatch(createSale, /UPDATE memberships SET membership_status='active'/);
  assert.match(createSale, /INSERT INTO memberships/);
  assert.match(createSale, /ORDEN \$\{data\.externalOrderNumber\}/);
});
