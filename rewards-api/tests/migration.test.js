import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const rosterMigrationUrl = new URL('../migrations/004_rewards_roster_normalization.sql',import.meta.url);
const attendanceMigrationUrl = new URL('../migrations/005_attendance_aliases_and_authoritative_roster_corrections.sql',import.meta.url);

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

test('la normalización crea titulares sin deduplicar sus datos de contacto',async() => {
  const sql = await fs.readFile(rosterMigrationUrl,'utf8');
  const holdersBlock = sql.split('CREATE TABLE rewards_holders (')[1].split('\n);')[0];

  for (const column of [
    'id uuid PRIMARY KEY DEFAULT gen_random_uuid()',
    'identity_key text NOT NULL UNIQUE',
    'display_name text NOT NULL',
    'active boolean NOT NULL DEFAULT true',
    'created_at timestamptz NOT NULL DEFAULT now()',
    'updated_at timestamptz NOT NULL DEFAULT now()'
  ]) {
    assert.ok(holdersBlock.includes(column),`falta ${column}`);
  }
  assert.match(holdersBlock,/\n  email text,/);
  assert.match(holdersBlock,/\n  phone text,/);
  assert.doesNotMatch(holdersBlock,/(?:email|phone) text[^,\n]*UNIQUE/);
  assert.doesNotMatch(holdersBlock,/UNIQUE \((?:email|phone)\)/);
});

test('la normalización separa las órdenes por temporada y comprador opcional',async() => {
  const sql = await fs.readFile(rosterMigrationUrl,'utf8');
  const ordersBlock = sql.split('CREATE TABLE rewards_orders (')[1].split('\n);')[0];

  for (const column of [
    'id uuid PRIMARY KEY DEFAULT gen_random_uuid()',
    'season_code text NOT NULL',
    'order_number text NOT NULL',
    'purchase_code text',
    'buyer_holder_id uuid',
    'seller text',
    'discount_label text',
    'purchased_at timestamptz',
    'payment_type text',
    'source_event text',
    'active boolean NOT NULL DEFAULT true',
    'created_at timestamptz NOT NULL DEFAULT now()',
    'updated_at timestamptz NOT NULL DEFAULT now()'
  ]) {
    assert.ok(ordersBlock.includes(column),`falta ${column}`);
  }
  assert.match(ordersBlock,/FOREIGN KEY \(season_code\) REFERENCES rewards_seasons\(code\) ON DELETE RESTRICT/);
  assert.match(ordersBlock,/FOREIGN KEY \(buyer_holder_id\) REFERENCES rewards_holders\(id\) ON DELETE SET NULL/);
  assert.match(ordersBlock,/UNIQUE \(season_code,order_number\)/);
  assert.doesNotMatch(ordersBlock,/buyer_holder_id uuid NOT NULL/);
});

test('rewards_programs conserva filas existentes y acepta enlaces normalizados opcionales',async() => {
  const sql = await fs.readFile(rosterMigrationUrl,'utf8');
  const alterBlock = sql.split('ALTER TABLE rewards_programs')[1].split(';')[0];

  assert.match(alterBlock,/ADD COLUMN holder_id uuid,/);
  assert.match(alterBlock,/ADD COLUMN order_id uuid,/);
  assert.match(alterBlock,/ADD COLUMN source_reference text,/);
  assert.doesNotMatch(alterBlock,/ADD COLUMN (?:holder_id|order_id|source_reference) [^,\n]*NOT NULL/);
  assert.match(alterBlock,/FOREIGN KEY \(holder_id\) REFERENCES rewards_holders\(id\) ON DELETE SET NULL/);
  assert.match(alterBlock,/FOREIGN KEY \(order_id\) REFERENCES rewards_orders\(id\) ON DELETE SET NULL/);
  assert.doesNotMatch(alterBlock,/\b(?:DROP|RENAME|ALTER)\s+(?:COLUMN|CONSTRAINT)\b/);
});

test('los aliases históricos apuntan a un programa vigente y no duplican su contador',async() => {
  const sql = await fs.readFile(attendanceMigrationUrl,'utf8');
  const aliasesBlock = sql.split('CREATE TABLE rewards_program_aliases (')[1].split('\n);')[0];

  assert.match(aliasesBlock,/program_id uuid NOT NULL REFERENCES rewards_programs\(id\) ON DELETE CASCADE/);
  assert.match(aliasesBlock,/season_code text NOT NULL REFERENCES rewards_seasons\(code\) ON DELETE RESTRICT/);
  assert.match(aliasesBlock,/historical_order_number text NOT NULL/);
  assert.match(aliasesBlock,/historical_zone text NOT NULL/);
  assert.match(aliasesBlock,/historical_section text NOT NULL/);
  assert.match(aliasesBlock,/historical_seat text NOT NULL/);
  assert.match(aliasesBlock,/UNIQUE \(\s*season_code,\s*historical_order_number,\s*historical_zone,\s*historical_section,\s*historical_seat\s*\)/s);
  assert.match(sql,/'15551242','Butaca Preferente Tercera Base','219'/);
  assert.match(sql,/p\.order_number='15772800'/);
  assert.match(sql,/CREATE TRIGGER rewards_programs_sync_manuel_historical_aliases/);
  assert.match(sql,/AFTER INSERT OR UPDATE OF season_code,order_number,section,seat,active,eligibility_status/);
  assert.match(sql,/Historical continuity is incomplete/);
  assert.doesNotMatch(sql,/DELETE FROM rewards_(?:programs|attendance|deliveries)/);
});

test('las correcciones autoritativas preservan programas y fijan las órdenes verificadas',async() => {
  const sql = await fs.readFile(attendanceMigrationUrl,'utf8');

  assert.match(sql,/WHEN 'D1' THEN 'F1'/);
  assert.match(sql,/WHEN 'D4' THEN 'F4'/);
  assert.match(sql,/SET order_number='15243415'/);
  assert.match(sql,/SET order_number='14957727'/);
  assert.match(sql,/manual_lock=true/g);
  assert.match(sql,/duplicated physical seat/);
  assert.doesNotMatch(sql,/DELETE\s+FROM/i);
  assert.doesNotMatch(sql,/TRUNCATE/i);
});
