import { badRequest } from './errors.js';

export const MEMBERSHIP_PRICE_BOOK_VERSION = 'LMP-2026-27-v1';
export const MEMBERSHIP_PRICING_SEASON = 'LMP-2026-27';

function integerAmount(value, field) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw badRequest(`El catalogo contiene un ${field} invalido.`);
  }
  return amount;
}

export function roundHalfUp(numerator, denominator) {
  if (!Number.isSafeInteger(numerator) || numerator < 0
    || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw badRequest('No fue posible calcular el importe comercial.');
  }
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

export function calculateMembershipPrice({ priceBook, locality, discount, seatCount }) {
  if (!priceBook || !locality || !discount) {
    throw badRequest('La localidad o el descuento seleccionado no existe en el catalogo.');
  }
  if (!Number.isSafeInteger(seatCount) || seatCount < 1 || seatCount > 20) {
    throw badRequest('seatCount debe estar entre 1 y 20.');
  }

  const listUnitPrice = integerAmount(locality.listUnitPrice, 'precio de lista');
  const commercialValue = listUnitPrice * seatCount;
  let pricingMode;
  let chargedUnits = seatCount;
  let bonusUnits = 0;
  let netAmount;

  if (discount.mode === 'regular') {
    pricingMode = 'regular';
    netAmount = commercialValue;
  } else if (discount.mode === 'percentage') {
    const rateBasisPoints = integerAmount(discount.rateBasisPoints, 'porcentaje');
    if (rateBasisPoints <= 0 || rateBasisPoints >= 10_000) {
      throw badRequest('El porcentaje del catalogo no es valido.');
    }
    pricingMode = 'percentage';
    const discountedUnit = roundHalfUp(listUnitPrice * (10_000 - rateBasisPoints), 10_000);
    netAmount = discountedUnit * seatCount;
  } else if (discount.mode === 'catalog_official') {
    const campaignUnitPrice = integerAmount(locality.july25UnitPrice, 'precio de campana');
    if (locality.july25Mode === 'two_for_one') {
      pricingMode = 'two_for_one';
      chargedUnits = Math.ceil(seatCount / 2);
      bonusUnits = seatCount - chargedUnits;
      netAmount = campaignUnitPrice * chargedUnits;
    } else if (locality.july25Mode === 'official_unit') {
      pricingMode = 'official_unit';
      netAmount = campaignUnitPrice * seatCount;
    } else {
      throw badRequest('El modo de campana del catalogo no es valido.');
    }
  } else {
    throw badRequest('El tipo de descuento del catalogo no es valido.');
  }

  if (!Number.isSafeInteger(commercialValue) || !Number.isSafeInteger(netAmount)
    || netAmount < 0 || netAmount > commercialValue) {
    throw badRequest('No fue posible calcular el importe comercial.');
  }

  return {
    priceBookVersion: priceBook.version,
    currency: priceBook.currency,
    localityCode: locality.code,
    localityName: locality.displayName,
    section: locality.section,
    discountCode: discount.code,
    discountName: discount.displayName,
    pricingMode,
    listUnitPrice,
    commercialValue,
    netAmount,
    discountAmount: commercialValue - netAmount,
    effectiveUnitPrice: roundHalfUp(netAmount, seatCount),
    chargedUnits,
    bonusUnits
  };
}
