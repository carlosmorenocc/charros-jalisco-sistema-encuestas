function integer(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : null
}

function money(record, field) {
  const rawAmount = record?.[field]
  if (rawAmount !== null && rawAmount !== undefined && rawAmount !== '') {
    const amount = Number(rawAmount)
    if (Number.isFinite(amount)) return amount
  }
  const rawCents = record?.[`${field}Cents`]
  if (rawCents === null || rawCents === undefined || rawCents === '') return null
  const cents = Number(rawCents)
  return Number.isFinite(cents) ? cents / 100 : null
}

export function normalizeMembershipPricingCatalog(payload) {
  const catalog = payload?.data || payload || {}
  return {
    priceBookVersion: catalog.priceBookVersion || catalog.pricingCode || '',
    seasonCode: catalog.seasonCode || '',
    currency: catalog.currency || 'MXN',
    localities: (Array.isArray(catalog.localities) ? catalog.localities : []).map((locality) => ({
      ...locality,
      listUnitPrice: money(locality, 'listUnitPrice'),
      july25UnitPrice: money(locality, 'july25UnitPrice'),
      sortOrder: Number(locality.sortOrder || 0),
    })).sort((left, right) => left.sortOrder - right.sortOrder || String(left.displayName).localeCompare(String(right.displayName), 'es-MX')),
    discounts: (Array.isArray(catalog.discounts) ? catalog.discounts : []).map((discount) => ({
      ...discount,
      rateBasisPoints: discount.rateBasisPoints == null ? null : integer(discount.rateBasisPoints),
      sortOrder: Number(discount.sortOrder || 0),
    })).sort((left, right) => left.sortOrder - right.sortOrder || String(left.displayName).localeCompare(String(right.displayName), 'es-MX')),
  }
}

export function normalizeMembershipPricingQuote(payload) {
  const quote = payload?.data || payload || {}
  const monetaryFields = ['listUnitPrice', 'commercialValue', 'netAmount', 'discountAmount', 'effectiveUnitPrice']
  return {
    ...quote,
    ...Object.fromEntries(monetaryFields.map((field) => [field, money(quote, field)])),
    chargedUnits: integer(quote.chargedUnits),
    bonusUnits: integer(quote.bonusUnits),
  }
}
