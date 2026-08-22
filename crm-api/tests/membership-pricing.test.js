import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateMembershipPrice, roundHalfUp } from '../src/lib/membershipPricing.js';
import { PgCrmRepository } from '../src/repositories/PgCrmRepository.js';

const priceBook = { version: 'LMP-2026-27-v1', currency: 'MXN' };
const regular = {
  code: 'regular', displayName: 'Sin descuento', mode: 'regular', rateBasisPoints: 0
};
const discount30 = {
  code: 'discount30', displayName: '30% de descuento', mode: 'percentage', rateBasisPoints: 3000
};
const july25 = {
  code: 'july25', displayName: 'Julio 2026 - precio especial', mode: 'catalog_official',
  rateBasisPoints: null
};

function locality(overrides = {}) {
  return {
    code: 'lateral_1_3', displayName: 'Lateral 1a-3a', section: 'General',
    listUnitPrice: 748000, july25UnitPrice: 748000, july25Mode: 'two_for_one',
    ...overrides
  };
}

test('calcula precio regular y descuento porcentual unitario half-up', () => {
  const noDiscount = calculateMembershipPrice({ priceBook, locality: locality(), discount: regular, seatCount: 2 });
  assert.equal(noDiscount.commercialValue, 1496000);
  assert.equal(noDiscount.netAmount, 1496000);

  const rounded = calculateMembershipPrice({
    priceBook,
    locality: locality({ listUnitPrice: 100001 }),
    discount: discount30,
    seatCount: 2
  });
  assert.equal(rounded.netAmount, 140002);
  assert.equal(rounded.discountAmount, 60000);
});

test('julio25 usa importes oficiales y 2x1 para cualquier cantidad', () => {
  for (const [seatCount, netAmount, chargedUnits, bonusUnits] of [
    [1, 748000, 1, 0], [2, 748000, 1, 1], [3, 1496000, 2, 1]
  ]) {
    const quote = calculateMembershipPrice({ priceBook, locality: locality(), discount: july25, seatCount });
    assert.equal(quote.netAmount, netAmount);
    assert.equal(quote.chargedUnits, chargedUnits);
    assert.equal(quote.bonusUnits, bonusUnits);
  }
});

test('julio25 respeta el precio oficial exacto fuera del 2x1', () => {
  const quote = calculateMembershipPrice({
    priceBook,
    locality: locality({
      code: 'lateral_premier_1_3', section: 'Preferente', listUnitPrice: 1410000,
      july25UnitPrice: 1058200, july25Mode: 'official_unit'
    }),
    discount: july25,
    seatCount: 2
  });
  assert.equal(quote.commercialValue, 2820000);
  assert.equal(quote.netAmount, 2116400);
  assert.equal(quote.discountAmount, 703600);
  assert.equal(quote.effectiveUnitPrice, 1058200);
});

test('redondeo half-up es determinista en enteros', () => {
  assert.equal(roundHalfUp(1, 2), 1);
  assert.equal(roundHalfUp(1, 3), 0);
  assert.equal(roundHalfUp(2, 3), 1);
});

test('migration008 conserva las diez tarifas oficiales exactas', () => {
  const sql = readFileSync(new URL('../migrations/008_membership_pricing.sql', import.meta.url), 'utf8');
  const expected = [
    ['vip', 2992000, 2244000], ['vip_lateral', 2686000, 2014500],
    ['premier_1_3', 2244000, 1683000], ['planta_baja_central', 1598000, 1198500],
    ['lateral_premier_1_3', 1410000, 1058200],
    ['butaca_preferente_1_3', 1224000, 918000],
    ['planta_baja_1_3', 1105000, 828700],
    ['lateral_preferente_1_3', 816000, 612000],
    ['lateral_1_3', 748000, 748000], ['planta_alta_1_3', 561000, 420700]
  ];
  for (const [code, list, special] of expected) {
    assert.match(sql, new RegExp(`'${code}'[^\\n]+${list},${special}`));
  }
  assert.match(sql, /'regular','Sin descuento','regular',0/);
});

test('repositorio publica catálogo y quote en pesos y rechaza section mismatch', async () => {
  const pool = {
    async query(text) {
      const sql = String(text).replace(/\s+/g, ' ').trim();
      if (sql.startsWith('SELECT version,season_code')) return { rows: [{
        version: 'LMP-2026-27-v1', season_code: 'LMP-2026-27',
        display_name: 'Abonos LMP 2026-2027', currency: 'MXN'
      }] };
      if (sql.startsWith('SELECT code,display_name,section')) return { rows: [{
        code: 'vip', display_name: 'VIP', section: 'VIP', list_unit_price: 2992000,
        july25_unit_price: 2244000, july25_mode: 'official_unit', promotion_label: null,
        sort_order: 1
      }] };
      if (sql.startsWith('SELECT code,display_name,mode')) return { rows: [{
        code: 'regular', display_name: 'Sin descuento', mode: 'regular',
        rate_basis_points: 0, sort_order: 1
      }] };
      if (sql.startsWith('SELECT pb.version,pb.currency')) return { rows: [{
        version: 'LMP-2026-27-v1', currency: 'MXN', locality_code: 'vip',
        locality_name: 'VIP', section: 'VIP', list_unit_price: 2992000,
        july25_unit_price: 2244000, july25_mode: 'official_unit',
        discount_code: 'regular', discount_name: 'Sin descuento',
        discount_mode: 'regular', rate_basis_points: 0
      }] };
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  const repository = new PgCrmRepository(pool);
  const catalog = await repository.getSubscriptionPricingCatalog();
  assert.equal(catalog.localities[0].listUnitPrice, 29920);
  const quote = await repository.quoteSubscription({
    localityCode: 'vip', discountCode: 'regular', seatCount: 2
  });
  assert.equal(quote.commercialValue, 59840);
  assert.equal(quote.netAmount, 59840);
  await assert.rejects(repository.resolveSubscriptionPricing(pool, {
    section: 'General', localityCode: 'vip', discountCode: 'regular', seatCount: 1
  }), /no pertenece/);
});
