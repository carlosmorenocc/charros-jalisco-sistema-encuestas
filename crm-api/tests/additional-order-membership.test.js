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
  assert.match(createSale, /INSERT INTO sale_holder_assignments/);
  assert.match(createSale, /ORDEN \$\{data\.externalOrderNumber\}/);
});

test('las migraciones conservan una venta por orden y permiten varios titulares', async () => {
  const structure = await readFile(new URL('../migrations/018_sale_holder_assignments.sql', import.meta.url), 'utf8');
  const reconciliation = await readFile(new URL('../migrations/019_reconcile_boletomovil_holders.sql', import.meta.url), 'utf8');
  const seatUnits = await readFile(new URL('../migrations/020_sale_seat_units.sql', import.meta.url), 'utf8');
  assert.match(structure,/CREATE TABLE sale_holder_assignments/);
  assert.match(structure,/quantity integer NOT NULL/);
  assert.match(reconciliation,/15399057.*noah-avila/);
  assert.match(reconciliation,/15399057.*sandra-lopez/);
  assert.match(reconciliation,/does not preserve the documented sale quantity/);
  assert.match(seatUnits,/CREATE TABLE sale_seat_units/);
  assert.match(seatUnits,/seat_personalization text/);
  assert.match(seatUnits,/generate_series\(1,ha\.quantity\)/);
});
