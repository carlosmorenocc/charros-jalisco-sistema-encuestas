import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const migrationUrl = new URL(
  '../migrations/006_program_eligibility_exceptions.sql',
  import.meta.url
);

test('la excepción de elegibilidad es nullable y tiene una allowlist cerrada',async() => {
  const sql = await fs.readFile(migrationUrl,'utf8');

  assert.match(sql,/ADD COLUMN eligibility_exception text;/u);
  assert.match(sql,/eligibility_exception IS NULL/u);
  assert.match(sql,/eligibility_exception IN \('authorized_giveaway_courtesy'\)/u);
  assert.match(sql,/eligibility_status = 'eligible'/u);
  assert.match(sql,/AND manual_lock/u);
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/iu);
  assert.doesNotMatch(sql,/holder_(?:name|email|phone)/u);
  assert.doesNotMatch(sql,/order_number/u);
});
