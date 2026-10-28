import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const migrationUrl = new URL('../migrations/007_delivery_recipients.sql',import.meta.url);

test('la migración de destinatarios deja el legado identificable y protege valores capturados',async() => {
  const sql = await fs.readFile(migrationUrl,'utf8');
  assert.match(sql,/ADD COLUMN recipient_name text;/u);
  assert.match(sql,/recipient_name IS NULL/u);
  assert.doesNotMatch(sql,/DEFAULT|SET NOT NULL/u);
  assert.match(sql,/recipient_name = btrim\(recipient_name\)/u);
  assert.match(sql,/char_length\(recipient_name\) BETWEEN 1 AND 120/u);
  assert.match(sql,/recipient_name !~ '\[\[:cntrl:\]\]'/u);
});
