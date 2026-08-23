import { describe, expect, it } from 'vitest'
import { normalizeMembershipPricingCatalog, normalizeMembershipPricingQuote } from './membershipPricing'

const catalog = {
  priceBookVersion: 'LMP-2026-27-v1', seasonCode: 'LMP-2026-27', currency: 'MXN',
  localities: [
    { code: 'general', displayName: 'Lateral 1RA', section: 'General', listUnitPrice: 7_480, july25UnitPrice: 7_480, july25Mode: 'two_for_one', sortOrder: 2 },
    { code: 'vip', displayName: 'VIP', section: 'VIP', listUnitPrice: 29_920, july25UnitPrice: 22_440, july25Mode: 'official_unit', sortOrder: 1 },
  ],
  discounts: [
    { code: 'discount30', displayName: '30% histórico', mode: 'percentage', rateBasisPoints: 3000, sortOrder: 1 },
    { code: 'july25', displayName: '25% julio 2026', mode: 'catalog_official', rateBasisPoints: null, sortOrder: 2 },
  ],
}

describe('catálogo de precios de membresía', () => {
  it('normaliza y ordena opciones sin alterar reglas del servidor', () => {
    const normalized = normalizeMembershipPricingCatalog({ data: catalog })
    expect(normalized.localities.map((item) => item.code)).toEqual(['vip', 'general'])
    expect(normalized.discounts.map((item) => item.code)).toEqual(['discount30', 'july25'])
  })

  it('normaliza la cotización autoritativa 2x1 sin reinterpretar importes', () => {
    expect(normalizeMembershipPricingQuote({ data: {
      priceBookVersion: 'LMP-2026-27-v1', currency: 'MXN', localityCode: 'general', localityName: 'Lateral 1RA', section: 'General', discountCode: 'july25', discountName: '25% julio 2026', pricingMode: 'two_for_one',
      listUnitPrice: 7_480, commercialValue: 22_440, netAmount: 14_960, discountAmount: 7_480, effectiveUnitPrice: 4_986.67, chargedUnits: 2, bonusUnits: 1,
    } })).toMatchObject({
      pricingMode: 'two_for_one', listUnitPrice: 7_480, commercialValue: 22_440, netAmount: 14_960, discountAmount: 7_480, chargedUnits: 2, bonusUnits: 1,
    })
  })

  it('convierte aliases explícitos en centavos una sola vez', () => {
    expect(normalizeMembershipPricingQuote({ data: { commercialValueCents: 2_992_000, netAmountCents: 2_244_000 } }))
      .toMatchObject({ commercialValue: 29_920, netAmount: 22_440 })
  })

  it('conserva snapshots históricos nulos como desconocidos', () => {
    expect(normalizeMembershipPricingQuote({ data: { commercialValue: null, chargedUnits: null } }))
      .toMatchObject({ commercialValue: null, chargedUnits: null })
  })
})
