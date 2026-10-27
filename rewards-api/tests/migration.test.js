import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('la migración operativa configura exactamente los 34 juegos locales',async() => {
  const sql = await fs.readFile(new URL('../migrations/003_operational_rewards.sql',import.meta.url),'utf8');
  const gamesBlock = sql.split('INSERT INTO rewards_games')[1].split('ON CONFLICT (played_on)')[0];
  const dates = [...gamesBlock.matchAll(/\('2026-(?:10|11|12)-\d{2}'/g)].map((match) => match[0].slice(2,-1));
  assert.equal(dates.length,34);
  assert.equal(new Set(dates).size,34);
  assert.ok(gamesBlock.includes("'2026-10-13'"));
  assert.ok(gamesBlock.includes("'2026-12-30'"));
  for (let sequence=1;sequence<=34;sequence+=1) {
    assert.match(gamesBlock,new RegExp(`,${sequence},'scheduled'\\)`));
  }
  const conflictUpdate = sql.split('ON CONFLICT (played_on) DO UPDATE SET')[1].split('INSERT INTO rewards_catalog')[0];
  assert.doesNotMatch(conflictUpdate,/report_status\s*=/);
});

test('el catálogo conserva como sorteo únicamente el hito 20',async() => {
  const sql = await fs.readFile(new URL('../migrations/003_operational_rewards.sql',import.meta.url),'utf8');
  const catalogBlock = sql.split('INSERT INTO rewards_catalog')[1];
  assert.match(catalogBlock,/\(18,'Invitado especial en CharrosTV','direct'\)/);
  assert.match(catalogBlock,/\(20,'Sorteo de bat de colección usado en juego','raffle'\)/);
  assert.equal((catalogBlock.match(/'raffle'/g) || []).length,1);
});
