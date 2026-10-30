import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const migrationUrl = new URL('../migrations/008_reward_redemption_offset.sql',import.meta.url);

test('la migración 008 habilita el canje en el hito y protege offsets negativos',async() => {
  const sql = await fs.readFile(migrationUrl,'utf8');

  assert.match(sql,/UPDATE rewards_catalog\s+SET redeem_from_offset = 0\s+WHERE redeem_from_offset <> 0;/u);
  assert.match(sql,/ALTER COLUMN redeem_from_offset SET DEFAULT 0;/u);
  assert.match(
    sql,
    /ADD CONSTRAINT rewards_catalog_redeem_from_offset_check\s+CHECK \(redeem_from_offset >= 0\);/u
  );
  assert.doesNotMatch(sql,/\b(?:DELETE|TRUNCATE|DROP)\b/iu);
});
