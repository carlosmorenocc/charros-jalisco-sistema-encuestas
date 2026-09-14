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

test('ventas usa el titular conciliado y conserva zona y descuento estructurados', async () => {
  const repository = await readFile(repositoryUrl, 'utf8');
  const migration = await readFile(new URL('../migrations/023_sale_truth_and_pricing_terms.sql', import.meta.url), 'utf8');
  assert.match(repository, /primary_holder_contact_id/);
  assert.match(repository, /COALESCE\(primary_holder\.contact_id,s\.effective_contact_id\)/);
  assert.match(repository, /price_book_version,section,locality_code,locality_name,discount_code,discount_name,pricing_mode/);
  assert.match(migration, /INSERT INTO sale_corrections/);
  assert.match(migration, /titular conciliado de la orden/);
  assert.match(migration, /ADD COLUMN locality_code/);
  assert.match(migration, /ADD COLUMN discount_code/);
});

test('contacto expone y actualiza personalización conservando la orden propietaria', async () => {
  const repository = await readFile(repositoryUrl, 'utf8');
  assert.match(repository, /'seatDetails'.*sale_seat_units/s);
  assert.match(repository, /updateContactSeatCustomization/);
  assert.match(repository, /ha\.contact_id=\$2/);
  assert.match(repository, /contact\.seat_customization_updated/);
});

test('detalle de contacto conserva verdad comercial, importes y butacas de la orden', async () => {
  const repository = await readFile(repositoryUrl, 'utf8');
  assert.match(repository, /'totalAmount',es\.effective_total_amount/);
  assert.match(repository, /'section',terms\.section/);
  assert.match(repository, /'discountName',terms\.discount_name/);
  assert.match(repository, /LEFT JOIN sale_commercial_terms terms ON terms\.sale_id=es\.id/);
  assert.match(repository, /payment_adjustments pa WHERE pa\.payment_id=p\.id/);
  assert.match(repository, /async listContacts[\s\S]*'localityName',terms\.locality_name[\s\S]*sale_seat_units su/);
});

test('ventas reconcilia contactos y expone una auditoria de solo lectura', async () => {
  const repository = await readFile(repositoryUrl, 'utf8');
  const audit = await readFile(new URL('../migrations/025_sale_integrity_audit.sql', import.meta.url), 'utf8');
  assert.match(repository, /async reconcileContactSaleState/);
  assert.match(repository, /effective_status IN \('confirmed','reserved'\)/);
  assert.match(repository, /THEN 'renewing'/);
  assert.match(repository, /async createSale[\s\S]*reconcileContactSaleState/);
  assert.match(repository, /async correctSale[\s\S]*previousHolders[\s\S]*reconcileContactSaleState/);
  assert.match(repository, /async cancelSale[\s\S]*affectedHolders[\s\S]*reconcileContactSaleState/);
  assert.match(audit, /CREATE OR REPLACE VIEW sale_integrity_audit/);
  assert.match(audit, /holder_quantity_mismatch/);
  assert.match(audit, /seat_unit_mismatch/);
  assert.match(audit, /invalid_primary_holder_count/);
  assert.match(audit, /overpaid/);
});
