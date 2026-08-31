import { badRequest } from './errors.js';

export const CONTACT_STATUSES = Object.freeze([
  'current_subscriber',
  'renewing',
  'new_subscriber',
  'former_subscriber',
  'prospect'
]);

export const CONTACT_SEGMENTS = Object.freeze(['portfolio', 'prospect']);
export const CONTACT_ASSIGNMENTS = Object.freeze(['assigned', 'unassigned']);
export const CONTACT_DATE_FIELDS = Object.freeze(['updatedAt', 'lastContact', 'nextFollowUp']);
export const SEASON_CODES = Object.freeze(['LMP-2026-27']);
export const MEMBERSHIP_SECTIONS = Object.freeze(['VIP', 'Preferente', 'General']);
export const CRM_PRIVACY_NOTICE_VERSION = '2026-08-01';
export const ACQUISITION_SOURCES = Object.freeze([
  'season_ticket_database', 'referral', 'box_office', 'digital', 'event', 'outbound', 'other'
]);

export const COMMERCIAL_STAGES = Object.freeze([
  'unassigned',
  'to_contact',
  'contacted',
  'follow_up',
  'interested',
  'reserved',
  'won',
  'lost'
]);

export const CHANNELS = Object.freeze([
  'phone',
  'whatsapp',
  'email',
  'in_person',
  'other'
]);

const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];
const TASK_STATES = ['open', 'completed', 'cancelled'];
const SALE_STATUSES = ['draft', 'reserved', 'confirmed', 'cancelled', 'refunded'];
const CONSENT_STATUSES = ['yes', 'no', 'unknown'];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value, { required = false, max = 500, field = 'valor' } = {}) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw badRequest(`${field} debe ser texto.`);
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (required && !cleaned) throw badRequest(`${field} es obligatorio.`);
  if (cleaned.length > max) throw badRequest(`${field} excede ${max} caracteres.`);
  return cleaned || null;
}

function catalogCode(value, field, { required = false } = {}) {
  const code = cleanString(value, { required, max: 80, field });
  if (code === undefined || code === null) {
    if (required) throw badRequest(`${field} es obligatorio.`);
    return code;
  }
  if (!/^[a-z0-9_]+$/.test(code)) throw badRequest(`${field} no es valido.`);
  return code;
}

function enumValue(value, values, field, { required = false } = {}) {
  if (value === undefined && !required) return undefined;
  if (!values.includes(value)) {
    throw badRequest(`${field} contiene un valor no permitido.`, { allowed: values });
  }
  return value;
}

function canonicalSeason(value, { required = false, field = 'seasonCode' } = {}) {
  const cleaned = cleanString(value, { required, max: 30, field });
  if (cleaned === undefined || cleaned === null) return cleaned;
  return enumValue(cleaned, SEASON_CODES, field, { required });
}

function uuid(value, field, { required = false } = {}) {
  if (value === undefined && !required) return undefined;
  if (value === null && !required) return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw badRequest(`${field} debe ser un UUID válido.`);
  }
  return value.toLowerCase();
}

function isoDate(value, field, { required = false } = {}) {
  if (value === undefined && !required) return undefined;
  if (value === null && !required) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw badRequest(`${field} debe ser una fecha ISO válida.`);
  }
  return new Date(value).toISOString();
}

function integer(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, required = false } = {}) {
  if (value === undefined && !required) return undefined;
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw badRequest(`${field} debe ser un entero entre ${min} y ${max}.`);
  }
  return parsed;
}

function decimal(value, field, { min = 0, required = false } = {}) {
  if (value === undefined && !required) return undefined;
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (!Number.isFinite(parsed) || parsed < min) {
    throw badRequest(`${field} debe ser un número mayor o igual a ${min}.`);
  }
  return parsed;
}

function email(value, field = 'email') {
  const cleaned = cleanString(value, { max: 254, field });
  if (cleaned == null) return cleaned;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    throw badRequest(`${field} no es válido.`);
  }
  return cleaned.toLowerCase();
}

function phone(value) {
  const cleaned = cleanString(value, { max: 30, field: 'phone' });
  if (cleaned == null) return cleaned;
  // Keep the exact canonical form used by crm-import/src/normalize.js so a
  // manual registration and the initial Excel promotion share one identity.
  let digits = cleaned.replace(/\D+/gu, '');
  if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2);
  if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3);
  if (digits.length !== 10) {
    throw badRequest('phone debe contener 10 dígitos de México; se acepta el prefijo +52 o 521.');
  }
  return digits;
}

function pickDefined(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

export function validateUuid(value, field = 'id') {
  return uuid(value, field, { required: true });
}

export function validateContact(input, { partial = false } = {}) {
  if (!isObject(input)) throw badRequest('El cuerpo del contacto debe ser un objeto.');
  const result = pickDefined({
    firstName: cleanString(input.firstName, { required: !partial, max: 100, field: 'firstName' })?.toLocaleUpperCase('es-MX'),
    lastName: cleanString(input.lastName, { required: !partial, max: 140, field: 'lastName' })?.toLocaleUpperCase('es-MX'),
    email: email(input.email),
    phone: phone(input.phone),
    municipality: cleanString(input.municipality, { max: 120, field: 'municipality' }),
    subscriberStatus: enumValue(input.subscriberStatus, CONTACT_STATUSES, 'subscriberStatus', { required: !partial }),
    commercialStage: enumValue(input.commercialStage, COMMERCIAL_STAGES, 'commercialStage', { required: !partial }),
    preferredChannel: input.preferredChannel === null ? null : enumValue(input.preferredChannel, CHANNELS, 'preferredChannel'),
    executiveId: uuid(input.executiveId, 'executiveId'),
    source: cleanString(input.source, { max: 120, field: 'source' }),
    acquisitionSource: input.acquisitionSource === null
      ? null
      : enumValue(input.acquisitionSource, ACQUISITION_SOURCES, 'acquisitionSource'),
    declaredTenureSeasons: input.declaredTenureSeasons === null
      ? null
      : integer(input.declaredTenureSeasons, 'declaredTenureSeasons', { min: 0, max: 100 }),
    consentStatus: input.consentStatus === undefined ? undefined : enumValue(input.consentStatus, CONSENT_STATUSES, 'consentStatus'),
    consentAt: isoDate(input.consentAt, 'consentAt'),
    privacyNoticeVersion: cleanString(input.privacyNoticeVersion, { max: 80, field: 'privacyNoticeVersion' }),
    summaryNotes: cleanString(input.summaryNotes, { max: 4000, field: 'summaryNotes' })
  });

  if (partial && Object.keys(result).length === 0) {
    throw badRequest('No se proporcionaron campos editables.');
  }
  if (!partial && !result.email && !result.phone) {
    throw badRequest('Se requiere al menos email o phone.');
  }
  return result;
}

export function validateInteraction(input) {
  if (!isObject(input)) throw badRequest('El cuerpo de la interacción debe ser un objeto.');
  return pickDefined({
    occurredAt: isoDate(input.occurredAt, 'occurredAt') ?? new Date().toISOString(),
    channel: enumValue(input.channel, CHANNELS, 'channel', { required: true }),
    outcome: cleanString(input.outcome, { required: true, max: 100, field: 'outcome' }),
    notes: cleanString(input.notes, { required: true, max: 5000, field: 'notes' }),
    isHumanContact: input.isHumanContact === undefined
      ? true
      : (() => {
          if (typeof input.isHumanContact !== 'boolean') throw badRequest('isHumanContact debe ser booleano.');
          return input.isHumanContact;
        })()
  });
}

export function validateTask(input, { partial = false } = {}) {
  if (!isObject(input)) throw badRequest('El cuerpo de la tarea debe ser un objeto.');
  const result = pickDefined({
    assignedTo: uuid(input.assignedTo, 'assignedTo', { required: !partial }),
    dueAt: isoDate(input.dueAt, 'dueAt', { required: !partial }),
    status: enumValue(input.status, TASK_STATUSES, 'status'),
    priority: input.priority === undefined ? undefined : enumValue(input.priority, ['low', 'normal', 'high', 'urgent'], 'priority'),
    description: cleanString(input.description, { required: !partial, max: 2000, field: 'description' })
  });
  if (partial && Object.keys(result).length === 0) throw badRequest('No se proporcionaron campos editables.');
  return result;
}

export function validateMembership(input) {
  if (!isObject(input)) throw badRequest('El cuerpo del abono debe ser un objeto.');
  const result = pickDefined({
    seasonCode: canonicalSeason(input.seasonCode, { required: true }),
    membershipStatus: enumValue(input.membershipStatus, ['active', 'renewing', 'expired', 'cancelled'], 'membershipStatus', { required: true }),
    seatCount: integer(input.seatCount ?? 1, 'seatCount', { min: 1, max: 100, required: true }),
    seatIdentifier: cleanString(input.seatIdentifier, { max: 100, field: 'seatIdentifier' }),
    zone: cleanString(input.zone, { max: 120, field: 'zone' }),
    section: input.section === null
      ? null
      : enumValue(input.section, MEMBERSHIP_SECTIONS, 'section'),
    localityCode: catalogCode(input.localityCode, 'localityCode'),
    discountCode: catalogCode(input.discountCode, 'discountCode'),
    product: cleanString(input.product, { max: 160, field: 'product' }),
    startDate: input.startDate == null ? input.startDate : isoDate(input.startDate, 'startDate'),
    renewalDate: input.renewalDate == null ? input.renewalDate : isoDate(input.renewalDate, 'renewalDate')
  });
  if (Array.isArray(input.units) && input.units.some((unit) => !isObject(unit))) {
    throw badRequest('units debe contener únicamente objetos.');
  }
  const units = Array.isArray(input.units) ? input.units.map((unit, index) => ({
    unitNumber: integer(unit.unitNumber ?? index + 1, `units[${index}].unitNumber`, { min: 1, max: 100, required: true }),
    seatIdentifier: cleanString(unit.seatIdentifier, { max: 100, field: `units[${index}].seatIdentifier` }),
    zone: cleanString(unit.zone, { max: 120, field: `units[${index}].zone` }),
    product: cleanString(unit.product, { max: 160, field: `units[${index}].product` }),
    jerseySize: unit.jerseySize == null ? unit.jerseySize : enumValue(unit.jerseySize, ['S', 'M', 'L', 'XL', '2XL'], `units[${index}].jerseySize`)
  })) : [];
  if (new Set(units.map((unit) => unit.unitNumber)).size !== units.length) {
    throw badRequest('Cada unitNumber debe ser único dentro del abono.');
  }
  if (units.length !== result.seatCount) {
    throw badRequest('La cantidad de units debe coincidir con seatCount.');
  }
  if (result.membershipStatus === 'active' && !result.startDate) {
    throw badRequest('startDate es obligatoria para un abono activo.');
  }
  return { ...result, units };
}

export function validateMembershipSeatAssignment(input) {
  if (!isObject(input)) throw badRequest('La asignación de abonos debe ser un objeto.');
  rejectUnknownKeys(input, new Set([
    'section', 'localityCode', 'discountCode', 'seatCount', 'units'
  ]), 'asignaciónAbonos');
  if (!Array.isArray(input.units) || input.units.some((unit) => !isObject(unit))) {
    throw badRequest('units debe ser un arreglo de unidades.');
  }

  const result = {
    section: enumValue(input.section, MEMBERSHIP_SECTIONS, 'section', { required: true }),
    localityCode: catalogCode(input.localityCode, 'localityCode', { required: true }),
    discountCode: catalogCode(input.discountCode, 'discountCode', { required: true }),
    seatCount: integer(input.seatCount, 'seatCount', { min: 1, max: 20, required: true }),
    units: input.units.map((unit, index) => {
      rejectUnknownKeys(unit, new Set(['unitNumber', 'seatIdentifier']), `units[${index}]`);
      const seatIdentifier = cleanString(unit.seatIdentifier, {
        required: true, max: 100, field: `units[${index}].seatIdentifier`
      });
      if (!seatIdentifier) throw badRequest(`units[${index}].seatIdentifier es obligatorio.`);
      return {
        unitNumber: integer(unit.unitNumber, `units[${index}].unitNumber`, {
          min: 1, max: 20, required: true
        }),
        seatIdentifier
      };
    })
  };

  if (result.units.length !== result.seatCount) {
    throw badRequest('La cantidad de units debe coincidir con seatCount.');
  }
  if (result.units.some((unit, index) => unit.unitNumber !== index + 1)) {
    throw badRequest('unitNumber debe formar la secuencia exacta de 1 a seatCount.');
  }
  const canonicalSeats = result.units.map((unit) => unit.seatIdentifier.toLocaleUpperCase('es-MX'));
  if (new Set(canonicalSeats).size !== canonicalSeats.length) {
    throw badRequest('Cada butaca debe ser única dentro del abono.');
  }
  return result;
}

export function validateMembershipCreation(input) {
  if (!isObject(input)) throw badRequest('El cuerpo del abono debe ser un objeto.');
  rejectUnknownKeys(input, new Set([
    'seasonCode', 'membershipStatus', 'seatCount', 'seatIdentifier', 'zone', 'section',
    'localityCode', 'discountCode', 'product', 'startDate', 'renewalDate', 'units'
  ]), 'membership');
  if (!Array.isArray(input.units) || input.units.some((unit) => !isObject(unit))) {
    throw badRequest('membership.units debe ser un arreglo de unidades.');
  }
  for (const [index, unit] of input.units.entries()) {
    rejectUnknownKeys(unit, new Set([
      'unitNumber', 'seatIdentifier', 'zone', 'product', 'jerseySize'
    ]), `membership.units[${index}]`);
  }
  const membership = validateMembership(input);
  validateMembershipSeatAssignment({
    section: membership.section,
    localityCode: membership.localityCode,
    discountCode: membership.discountCode,
    seatCount: membership.seatCount,
    units: membership.units.map(({ unitNumber, seatIdentifier }) => ({ unitNumber, seatIdentifier }))
  });
  return membership;
}

const MANUAL_MEMBERSHIP_STATUS = Object.freeze({
  current_subscriber: 'active',
  new_subscriber: 'active',
  renewing: 'renewing',
  former_subscriber: 'expired'
});

function rejectUnknownKeys(input, allowed, field) {
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) throw badRequest(`${field} contiene campos no permitidos.`, { fields: unknown });
}

export function validateManualRegistration(input, { defaultAssigneeId }) {
  if (!isObject(input)) throw badRequest('El alta manual debe ser un objeto.');
  rejectUnknownKeys(input, new Set([
    'contact', 'consent', 'initialObservation', 'membership', 'nextTask'
  ]), 'altaManual');
  if (!isObject(input.contact)) throw badRequest('contact es obligatorio.');
  rejectUnknownKeys(input.contact, new Set([
    'firstName', 'lastName', 'email', 'phone', 'municipality', 'subscriberStatus',
    'commercialStage', 'preferredChannel', 'executiveId', 'declaredTenureSeasons', 'businessSource'
  ]), 'contact');

  const businessSource = enumValue(
    input.contact.businessSource, ACQUISITION_SOURCES, 'contact.businessSource', { required: true }
  );

  const consentInput = input.consent ?? {};
  if (!isObject(consentInput)) throw badRequest('consent debe ser un objeto.');
  rejectUnknownKeys(consentInput, new Set(['status']), 'consent');
  const consentStatus = enumValue(
    consentInput.status ?? 'unknown', CONSENT_STATUSES, 'consent.status', { required: true }
  );
  const privacyNoticeVersion = consentStatus === 'unknown' ? null : CRM_PRIVACY_NOTICE_VERSION;

  if (!isObject(input.initialObservation)) {
    throw badRequest('initialObservation es obligatoria.');
  }
  rejectUnknownKeys(input.initialObservation, new Set(['notes']), 'initialObservation');
  const observationNotes = cleanString(input.initialObservation.notes, {
    required: true, max: 4000, field: 'initialObservation.notes'
  });

  const { businessSource: _businessSource, ...contactInput } = input.contact;
  const contact = validateContact({
    ...contactInput,
    source: 'crm_manual',
    acquisitionSource: businessSource,
    consentStatus,
    privacyNoticeVersion,
    summaryNotes: observationNotes
  });

  const expectedMembershipStatus = MANUAL_MEMBERSHIP_STATUS[contact.subscriberStatus] ?? null;
  let membership = null;
  if (!expectedMembershipStatus) {
    if (input.membership !== undefined && input.membership !== null) {
      throw badRequest('Un prospecto no debe registrar abonos hasta cambiar su clasificación.');
    }
  } else {
    if (!isObject(input.membership)) {
      throw badRequest('membership es obligatorio para esta clasificación.');
    }
    rejectUnknownKeys(input.membership, new Set([
      'seatCount', 'seatIdentifier', 'zone', 'section', 'localityCode', 'discountCode',
      'product', 'startDate', 'renewalDate', 'units'
    ]), 'membership');
    if (!Array.isArray(input.membership.units)
      || input.membership.units.some((unit) => !isObject(unit))) {
      throw badRequest('membership.units debe ser un arreglo de unidades.');
    }
    for (const [index, unit] of input.membership.units.entries()) {
      rejectUnknownKeys(unit, new Set([
        'unitNumber', 'seatIdentifier', 'zone', 'product', 'jerseySize'
      ]), `membership.units[${index}]`);
    }
    membership = validateMembership({
      ...input.membership,
      seasonCode: 'LMP-2026-27',
      membershipStatus: expectedMembershipStatus
    });
    if (membership.section) {
      validateMembershipSeatAssignment({
        section: membership.section,
        localityCode: membership.localityCode,
        discountCode: membership.discountCode,
        seatCount: membership.seatCount,
        units: membership.units.map(({ unitNumber, seatIdentifier }) => ({
          unitNumber, seatIdentifier
        }))
      });
    }
    if (membership.seatCount > 20) throw badRequest('seatCount no puede exceder 20 en un alta manual.');
    if (membership.membershipStatus === 'renewing' && !membership.renewalDate) {
      throw badRequest('renewalDate es obligatoria para una renovación.');
    }
    membership.units.sort((left, right) => left.unitNumber - right.unitNumber);
    if (membership.units.some((unit, index) => unit.unitNumber !== index + 1)) {
      throw badRequest('unitNumber debe formar la secuencia exacta de 1 a seatCount.');
    }
  }

  if (contact.declaredTenureSeasons !== undefined && contact.declaredTenureSeasons !== null
    && contact.subscriberStatus !== 'prospect' && contact.declaredTenureSeasons < 1) {
    throw badRequest('declaredTenureSeasons debe ser al menos 1 para un abonado o exabonado.');
  }

  let nextTask = null;
  if (input.nextTask !== undefined && input.nextTask !== null) {
    if (!isObject(input.nextTask)) throw badRequest('nextTask debe ser un objeto.');
    rejectUnknownKeys(input.nextTask, new Set([
      'assignedTo', 'description', 'dueAt', 'priority'
    ]), 'nextTask');
    nextTask = validateTask({
      ...input.nextTask,
      assignedTo: input.nextTask.assignedTo ?? contact.executiveId ?? defaultAssigneeId,
      status: 'pending'
    });
    if (new Date(nextTask.dueAt).getTime() <= Date.now()) {
      throw badRequest('nextTask.dueAt debe estar en el futuro.');
    }
  }

  return {
    contact,
    consent: {
      status: consentStatus,
      privacyNoticeVersion: privacyNoticeVersion ?? null,
      source: 'crm_manual',
      purpose: 'marketing'
    },
    initialObservation: { notes: observationNotes },
    membership,
    nextTask
  };
}

export function validateSale(input) {
  if (!isObject(input)) throw badRequest('El cuerpo de la venta debe ser un objeto.');
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) throw badRequest('La venta requiere al menos un concepto.');
  const result = {
    externalOrderNumber: cleanString(input.externalOrderNumber, { required: true, max: 80, field: 'externalOrderNumber' }),
    saleType: enumValue(input.saleType, ['new', 'renewal'], 'saleType', { required: true }),
    closeStage: enumValue(input.closeStage ?? (input.status === 'reserved' ? 'reserved' : 'won'), ['reserved', 'won'], 'closeStage', { required: true }),
    contactId: uuid(input.contactId, 'contactId', { required: true }),
    executiveId: uuid(input.executiveId, 'executiveId', { required: true }),
    seasonCode: canonicalSeason(input.seasonCode, { required: true }),
    status: enumValue(input.status ?? 'draft', SALE_STATUSES, 'status', { required: true }),
    soldAt: isoDate(input.soldAt, 'soldAt'),
    currency: enumValue(input.currency ?? 'MXN', ['MXN'], 'currency', { required: true }),
    notes: cleanString(input.notes, { max: 4000, field: 'notes' }),
    items: items.map((item, index) => ({
      product: cleanString(item.product, { required: true, max: 160, field: `items[${index}].product` }),
      zone: cleanString(item.zone, { max: 120, field: `items[${index}].zone` }),
      quantity: integer(item.quantity, `items[${index}].quantity`, { min: 1, max: 1000, required: true }),
      unitPrice: decimal(item.unitPrice, `items[${index}].unitPrice`, { min: 0, required: true })
    })),
    pricing: input.pricing == null ? null : validateSubscriptionQuote(input.pricing),
    payments: (Array.isArray(input.payments) ? input.payments : []).map((payment, index) => ({
      amount: decimal(payment.amount, `payments[${index}].amount`, { min: 0.01, required: true }),
      method: cleanString(payment.method, { required: true, max: 80, field: `payments[${index}].method` }),
      paidAt: isoDate(payment.paidAt, `payments[${index}].paidAt`) ?? new Date().toISOString(),
      reference: cleanString(payment.reference, { max: 160, field: `payments[${index}].reference` })
    }))
  };
  if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]{0,79}$/.test(result.externalOrderNumber)) {
    throw badRequest('externalOrderNumber contiene caracteres no permitidos.');
  }
  if (result.status === 'confirmed' && !result.soldAt) {
    throw badRequest('soldAt es obligatoria para confirmar una venta.');
  }
  return result;
}

export function validateSaleCorrection(input) {
  if (!isObject(input)) throw badRequest('La corrección de venta debe ser un objeto.');
  const reason = cleanString(input.reason, { required: true, max: 500, field: 'reason' });
  if (reason.length < 5) throw badRequest('reason debe tener al menos 5 caracteres.');
  const sale = validateSale({ ...input, payments: [] });
  return { ...sale, payments: [], reason };
}

export function validateSaleCancellation(input) {
  if (!isObject(input)) throw badRequest('El cuerpo de la anulación debe ser un objeto.');
  const reason = cleanString(input.reason, { required: true, max: 500, field: 'reason' });
  if (reason.length < 5) throw badRequest('reason debe tener al menos 5 caracteres.');
  return { reason };
}

export function validatePayment(input) {
  if (!isObject(input)) throw badRequest('El cuerpo del pago debe ser un objeto.');
  return {
    amount: decimal(input.amount, 'amount', { min: 0.01, required: true }),
    method: cleanString(input.method, { required: true, max: 80, field: 'method' }),
    paidAt: isoDate(input.paidAt, 'paidAt') ?? new Date().toISOString(),
    reference: cleanString(input.reference, { max: 160, field: 'reference' })
  };
}

export function validateDashboardPdfEvent(input) {
  if (!isObject(input) || !isObject(input.filters)) {
    throw badRequest('El evento de PDF debe incluir filters.');
  }
  const allowedRoot = new Set(['filters']);
  const allowedFilters = new Set(['season', 'executiveId', 'from', 'to']);
  if (Object.keys(input).some((key) => !allowedRoot.has(key))
    || Object.keys(input.filters).some((key) => !allowedFilters.has(key))) {
    throw badRequest('El evento de PDF contiene campos no permitidos.');
  }
  return {
    filters: pickDefined({
      season: canonicalSeason(input.filters.season, { field: 'season' }),
      executiveId: input.filters.executiveId ? uuid(input.filters.executiveId, 'executiveId') : undefined,
      from: input.filters.from ? isoDate(input.filters.from, 'from') : undefined,
      to: input.filters.to ? isoDate(input.filters.to, 'to') : undefined
    })
  };
}

export function validateSubscriptionQuote(input) {
  if (!isObject(input)) throw badRequest('La cotizacion debe ser un objeto.');
  rejectUnknownKeys(input, new Set(['localityCode', 'discountCode', 'seatCount']), 'cotizacion');
  return {
    localityCode: catalogCode(input.localityCode, 'localityCode', { required: true }),
    discountCode: catalogCode(input.discountCode, 'discountCode', { required: true }),
    seatCount: integer(input.seatCount, 'seatCount', { min: 1, max: 20, required: true })
  };
}

export function parseListQuery(query = {}) {
  const page = integer(query.page ?? 1, 'page', { min: 1, max: 100000, required: true });
  const pageSize = integer(query.pageSize ?? 25, 'pageSize', { min: 1, max: 100, required: true });
  return {
    page,
    pageSize,
    season: canonicalSeason(query.season, { field: 'season' }),
    search: cleanString(query.search, { max: 160, field: 'search' }),
    segment: query.segment ? enumValue(query.segment, CONTACT_SEGMENTS, 'segment') : undefined,
    assignment: query.assignment ? enumValue(query.assignment, CONTACT_ASSIGNMENTS, 'assignment') : undefined,
    dateField: query.dateField
      ? enumValue(query.dateField, CONTACT_DATE_FIELDS, 'dateField')
      : 'updatedAt',
    taskState: query.taskState ? enumValue(query.taskState, TASK_STATES, 'taskState') : undefined,
    subscriberStatus: query.subscriberStatus ? enumValue(query.subscriberStatus, CONTACT_STATUSES, 'subscriberStatus') : undefined,
    commercialStage: query.commercialStage ? enumValue(query.commercialStage, COMMERCIAL_STAGES, 'commercialStage') : undefined,
    lastChannel: query.lastChannel ? enumValue(query.lastChannel, CHANNELS, 'lastChannel') : undefined,
    executiveId: query.executiveId ? uuid(query.executiveId, 'executiveId') : undefined,
    from: query.from ? isoDate(query.from, 'from') : undefined,
    to: query.to ? isoDate(query.to, 'to') : undefined,
    sort: cleanString(query.sort, { max: 50, field: 'sort' }) ?? 'updatedAt',
    order: query.order === 'asc' ? 'asc' : 'desc',
    includeDeleted: query.includeDeleted === 'true',
    deletedOnly: query.deletedOnly === 'true'
  };
}
