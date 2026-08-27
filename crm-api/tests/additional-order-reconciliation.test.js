import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../migrations/017_reconcile_additional_orders_for_named_contacts.sql', import.meta.url);

test('la conciliación dirigida solo agrega el déficit positivo de ventas confirmadas', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(migration, /FERNANDO BARAJAS RAMIREZ/);
  assert.match(migration, /FABBY LEAÑO/);
  assert.match(migration, /effective_status IN \('confirmed', 'reserved'\)/);
  assert.match(migration, /sales\.sold_seats > COALESCE\(memberships\.active_seats, 0\)/);
  assert.match(migration, /sales\.sold_seats - COALESCE\(memberships\.active_seats, 0\) AS missing_seats/);
  assert.doesNotMatch(migration, /UPDATE sales|DELETE FROM/);
});
